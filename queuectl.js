#!/usr/bin/env node

const { Command } = require('commander');
const { exec } = require('child_process');
const Table = require('cli-table3');
const chalk = require('chalk');
const JobQueue = require('./src/jobQueue');
const { WorkerManager } = require('./src/workerManager');
const { Config } = require('./src/config');

const program = new Command();

program
  .name('queuectl')
  .description('CLI-based background job queue system')
  .version('1.0.0');

// ========== ENQUEUE COMMAND ==========
program
  .command('enqueue')
  .description('Add a new job to the queue')
  .argument('<json>', 'Job JSON string (e.g., \'{"id":"job1","command":"echo hello"}\')')
  .option('--run-now', 'Execute the command immediately after enqueueing')
  .action(async (jsonString, options) => {
    try {
      const jobData = JSON.parse(jsonString);

      if (!jobData.command) {
        console.error(chalk.red('Error: Job must have a "command" field'));
        process.exit(1);
      }

      const jobQueue = new JobQueue();
      const job = await jobQueue.enqueueJob(jobData);

      console.log(chalk.green('Job enqueued successfully:'));
      console.log(JSON.stringify(job, null, 2));

      // Optional immediate execution
      if (options.runNow) {
        console.log(chalk.cyan(`\nExecuting now: ${jobData.command}`));
        exec(jobData.command, (error, stdout, stderr) => {
          if (error) {
            console.error(chalk.red(`Execution failed: ${stderr || error.message}`));
          } else {
            console.log(chalk.yellow(`Output:\n${stdout.trim()}`));
          }
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== WORKER COMMANDS ==========
const workerCmd = program.command('worker').description('Manage workers');

workerCmd
  .command('start')
  .description('Start worker processes')
  .option('-c, --count <number>', 'Number of workers to start', '1')
  .action(async (options) => {
    try {
      const count = parseInt(options.count);
      if (isNaN(count) || count < 1) {
        console.error(chalk.red('Error: Count must be a positive integer'));
        process.exit(1);
      }

      const manager = new WorkerManager();
      await manager.startWorkers(count);

      process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, stopping workers...');
        await manager.stopAllWorkers();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, stopping workers...');
        await manager.stopAllWorkers();
        process.exit(0);
      });

      await new Promise(() => {});
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

workerCmd
  .command('stop')
  .description('Stop all running workers')
  .action(async () => {
    console.log(chalk.yellow('Note: Use Ctrl+C or kill the process to stop running workers.'));
  });

// ========== STATUS COMMAND ==========
program
  .command('status')
  .description('Show summary of all job states and active workers')
  .action(async () => {
    try {
      const jobQueue = new JobQueue();
      const manager = new WorkerManager();

      const stats = await jobQueue.getJobStats();
      const workers = await manager.getActiveWorkers();

      console.log(chalk.cyan('=== Job Queue Status ===\n'));
      console.log(`Total Jobs:        ${stats.total}`);
      console.log(`Pending:           ${stats.pending}`);
      console.log(`Processing:        ${stats.processing}`);
      console.log(`Completed:         ${stats.completed}`);
      console.log(`Failed (Retrying): ${stats.failed}`);
      console.log(`Dead (DLQ):        ${stats.dead}`);

      console.log(chalk.cyan('\n=== Active Workers ===\n'));
      if (workers.length === 0) {
        console.log(chalk.gray('No active workers'));
      } else {
        workers.forEach(worker => {
          console.log(`Worker ID:        ${worker.id}`);
          console.log(`Status:           ${worker.status}`);
          console.log(`Jobs Processed:   ${worker.jobs_processed}`);
          console.log(`Started:          ${new Date(worker.started_at).toLocaleString()}`);
          console.log(`Last Heartbeat:   ${new Date(worker.last_heartbeat).toLocaleString()}`);
          console.log('---');
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== LIST COMMAND (TABLE FORMAT) ==========
program
  .command('list')
  .description('List jobs by state in table format')
  .option('-s, --state <state>', 'Filter by state (pending, processing, completed, failed, dead)')
  .action(async (options) => {
    try {
      const jobQueue = new JobQueue();
      const jobs = await jobQueue.listJobs(options.state || null);

      if (!jobs || jobs.length === 0) {
        console.log(chalk.gray('No jobs found.'));
        return;
      }

      const sortedJobs = jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const displayJobs = sortedJobs.slice(0, 5); // show only latest 5

      const table = new Table({
        head: ['Job ID', 'Command', 'State', 'Attempts', 'Created At', 'Output'],
        colWidths: [20, 30, 12, 10, 26, 25],
        wordWrap: true
      });

      displayJobs.forEach(job => {
        let stateColor;
        switch (job.state) {
          case 'completed': stateColor = chalk.green(job.state); break;
          case 'failed': stateColor = chalk.red(job.state); break;
          case 'dead': stateColor = chalk.bgRed.white(job.state); break;
          case 'pending': stateColor = chalk.yellow(job.state); break;
          case 'processing': stateColor = chalk.cyan(job.state); break;
          default: stateColor = chalk.white(job.state);
        }

        const output = job.output
          ? job.output.substring(0, 20).replace(/\n/g, ' ') + (job.output.length > 20 ? '...' : '')
          : job.error_message
            ? job.error_message.substring(0, 20) + (job.error_message.length > 20 ? '...' : '')
            : '';

        table.push([
          job.id,
          job.command,
          stateColor,
          `${job.attempts}/${job.max_retries}`,
          new Date(job.created_at).toLocaleString(),
          output || 'N/A'
        ]);
      });

      console.log(table.toString());
      console.log(chalk.cyan(`\nShowing latest ${displayJobs.length} of ${jobs.length} job(s).`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== DLQ COMMANDS ==========
const dlqCmd = program.command('dlq').description('Dead Letter Queue operations');

dlqCmd
  .command('list')
  .description('List all jobs in the Dead Letter Queue')
  .action(async () => {
    try {
      const jobQueue = new JobQueue();
      const jobs = await jobQueue.listDLQ();

      if (jobs.length === 0) {
        console.log(chalk.gray('No jobs in Dead Letter Queue.'));
        return;
      }

      const table = new Table({
        head: ['Job ID', 'Command', 'Attempts', 'Error Message'],
        colWidths: [25, 30, 12, 40],
        wordWrap: true
      });

      jobs.forEach(job => {
        table.push([
          job.id,
          job.command,
          `${job.attempts}/${job.max_retries}`,
          job.error_message || 'N/A'
        ]);
      });

      console.log(table.toString());
      console.log(chalk.yellow(`Total: ${jobs.length} job(s) in DLQ`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

dlqCmd
  .command('retry')
  .description('Retry a job from the Dead Letter Queue')
  .argument('<jobId>', 'Job ID to retry')
  .action(async (jobId) => {
    try {
      const jobQueue = new JobQueue();
      const job = await jobQueue.retryDLQJob(jobId);
      console.log(chalk.green('Job moved from DLQ back to pending queue:'));
      console.log(JSON.stringify(job, null, 2));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== CONFIG COMMANDS ==========
const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Configuration key (e.g., max-retries, backoff-base)')
  .argument('<value>', 'Configuration value')
  .action(async (key, value) => {
    try {
      const normalizedKey = key.replace(/-/g, '_');
      const validKeys = ['max_retries', 'backoff_base'];

      if (!validKeys.includes(normalizedKey)) {
        console.error(chalk.red(`Error: Invalid config key. Valid keys: ${validKeys.join(', ')}`));
        process.exit(1);
      }

      const config = new Config();
      await config.set(normalizedKey, value);
      console.log(chalk.green(`Configuration updated: ${normalizedKey} = ${value}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

configCmd
  .command('get')
  .description('Get a configuration value')
  .argument('<key>', 'Configuration key')
  .action(async (key) => {
    try {
      const normalizedKey = key.replace(/-/g, '_');
      const config = new Config();
      const value = await config.get(normalizedKey);

      if (value === null) {
        console.log(chalk.yellow(`Configuration key "${normalizedKey}" not found.`));
      } else {
        console.log(chalk.cyan(`${normalizedKey} = ${value}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

configCmd
  .command('list')
  .description('List all configuration values')
  .action(async () => {
    try {
      const config = new Config();
      const allConfig = await config.getAll();

      console.log(chalk.cyan('\n=== Configuration ===\n'));
      allConfig.forEach(item => {
        console.log(`${item.key}: ${item.value}`);
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== EXECUTE CLI ==========
program.parse();
