const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const JobQueue = require('./jobQueue');
const { supabase } = require('./db');
const { v4: uuidv4 } = require('uuid');

class Worker {
  constructor(workerId = null) {
    this.workerId = workerId || `worker-${uuidv4()}`;
    this.jobQueue = new JobQueue();
    this.isRunning = false;
    this.currentJob = null;
    this.jobsProcessed = 0;
    this.pollInterval = 1000;
    this.heartbeatInterval = 5000;
    this.heartbeatTimer = null;
  }

  async start() {
    this.isRunning = true;

    await supabase.from('workers').insert({
      id: this.workerId,
      status: 'active',
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      jobs_processed: 0
    });

    console.log(`Worker ${this.workerId} started`);

    this.startHeartbeat();
    await this.processLoop();
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await supabase
          .from('workers')
          .update({
            last_heartbeat: new Date().toISOString(),
            jobs_processed: this.jobsProcessed
          })
          .eq('id', this.workerId);
      } catch (error) {
        console.error(`Heartbeat failed: ${error.message}`);
      }
    }, this.heartbeatInterval);
  }

  async processLoop() {
    while (this.isRunning) {
      try {
        const job = await this.jobQueue.acquireJobLock(this.workerId);

        if (job) {
          this.currentJob = job;
          await this.executeJob(job);
          this.currentJob = null;
        } else {
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error(`Worker error: ${error.message}`);
        await this.sleep(this.pollInterval);
      }
    }

    await this.cleanup();
  }

  // === Updated method with output logging ===
  async executeJob(job) {
    console.log(`[${this.workerId}] Processing job ${job.id}: ${job.command}`);

    try {
      // Fetch backoff base from config
      const { data: configData } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'backoff_base')
        .maybeSingle();

      const backoffBase = configData ? parseInt(configData.value) : 2;

      // Run the job command and capture output
      const { stdout, stderr } = await execPromise(job.command, { timeout: 60000 });
      const output = stdout || stderr || "No output";
          console.log(`[${this.workerId}] Output:\n${output}`);


      // Update job state with output stored in Supabase
      await this.jobQueue.markJobCompleted(job.id);
      await this.jobQueue.updateJobState(job.id, 'completed', { output });

      this.jobsProcessed++;
      console.log(`[${this.workerId}] Job ${job.id} completed successfully`);
    } catch (error) {
      const errMsg = error.stderr || error.message || "Unknown error";

      // On failure, mark job as failed and backoff
      const { data: configData } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'backoff_base')
        .maybeSingle();
      const backoffBase = configData ? parseInt(configData.value) : 2;

      await this.jobQueue.markJobFailed(job.id, errMsg, backoffBase);
      console.error(`[${this.workerId}] Job ${job.id} failed: ${errMsg}`);
    }
  }

  async stop() {
    console.log(`[${this.workerId}] Stopping gracefully...`);
    this.isRunning = false;

    await supabase
      .from('workers')
      .update({ status: 'stopping' })
      .eq('id', this.workerId);

    if (this.currentJob) {
      console.log(`[${this.workerId}] Waiting for current job to finish...`);
      while (this.currentJob) {
        await this.sleep(100);
      }
    }
  }

  async cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    await supabase
      .from('workers')
      .update({
        status: 'stopped',
        jobs_processed: this.jobsProcessed
      })
      .eq('id', this.workerId);

    console.log(`[${this.workerId}] Worker stopped. Processed ${this.jobsProcessed} jobs.`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Worker;
