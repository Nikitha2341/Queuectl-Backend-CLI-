const JobQueue = require('../src/jobQueue');

const  Worker  = require('../src/worker');
const { Config } = require('../src/config');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBasicJobCompletion() {
  console.log('\n=== Test 1: Basic Job Completion ===');

  const jobQueue = new JobQueue();
  const job = await jobQueue.enqueueJob({
    id: 'test-job-1-' + Date.now(),
    command: 'echo "Hello World"'
  });

  console.log('✓ Job enqueued:', job.id);

  const worker = new Worker('test-worker-1');
  worker.start().catch(console.error);

  await sleep(7000);

  const completedJob = await jobQueue.getJob(job.id);
  await worker.stop();

  if (completedJob.state === 'completed') {
    console.log('✓ Job completed successfully');
    return true;
  } else {
    console.log('✗ Job did not complete. State:', completedJob.state);
    return false;
  }
}

async function testFailedJobRetry() {
  console.log('\n=== Test 2: Failed Job Retry with Backoff ===');

  const jobQueue = new JobQueue();
  const job = await jobQueue.enqueueJob({
    id: 'test-job-2-' + Date.now(),
    command: 'invalid-command-that-fails',
    max_retries: 2
  });

  console.log('✓ Job enqueued:', job.id);

  const worker = new Worker('test-worker-2');
  worker.start().catch(console.error);

  await sleep(7000); // give time for retry backoff

let currentJob = await jobQueue.getJob(job.id);
console.log(`✓ After first attempt: state=${currentJob.state}, attempts=${currentJob.attempts}`);

if (currentJob.state === 'pending') {
  console.log('Waiting for retry cycle...');
  await sleep(8000); // extra time for retry and DLQ logic
  currentJob = await jobQueue.getJob(job.id);
}

  if ((currentJob.state === 'failed' && currentJob.attempts === 1) || 
    (currentJob.state === 'dead' && currentJob.attempts >= 2)) {
  console.log('✓ Job moved to failed or dead state as expected');


    await sleep(5000);

    currentJob = await jobQueue.getJob(job.id);
    console.log(`✓ After retry period: state=${currentJob.state}, attempts=${currentJob.attempts}`);

    await sleep(5000);

    currentJob = await jobQueue.getJob(job.id);

    await worker.stop();

    if (currentJob.state === 'dead' && currentJob.attempts >= 2) {
      console.log('✓ Job moved to DLQ after exhausting retries');
      return true;
    } else {
      console.log('✗ Job did not move to DLQ. State:', currentJob.state);
      return false;
    }
  } else {
    await worker.stop();
    console.log('✗ Job did not fail as expected');
    return false;
  }
}

async function testDLQRetry() {
  console.log('\n=== Test 3: DLQ Retry ===');

  const jobQueue = new JobQueue();

  const dlqJobs = await jobQueue.listDLQ();
  if (dlqJobs.length === 0) {
    console.log('✗ No jobs in DLQ to retry');
    return false;
  }

  const jobToRetry = dlqJobs[0];
  console.log('✓ Found job in DLQ:', jobToRetry.id);

  await jobQueue.retryDLQJob(jobToRetry.id);

  const retriedJob = await jobQueue.getJob(jobToRetry.id);

  if (retriedJob.state === 'pending' && retriedJob.attempts === 0) {
    console.log('✓ Job successfully moved from DLQ back to pending queue');
    return true;
  } else {
    console.log('✗ Job retry failed. State:', retriedJob.state);
    return false;
  }
}

async function testMultipleWorkers() {
  console.log('\n=== Test 4: Multiple Workers ===');

  const jobQueue = new JobQueue();

  const jobs = [];
  for (let i = 1; i <= 5; i++) {
    const job = await jobQueue.enqueueJob({
      id: `multi-job-${i}-${Date.now()}`,
      command: `sleep 1 && echo "Job ${i}"`
    });
    jobs.push(job);
  }

  console.log('✓ Enqueued 5 jobs');

  const worker1 = new Worker('multi-worker-1');
  const worker2 = new Worker('multi-worker-2');

  worker1.start().catch(console.error);
  worker2.start().catch(console.error);

  await sleep(8000);

  await worker1.stop();
  await worker2.stop();
  await sleep(3000);

  let completedCount = 0;
  for (const job of jobs) {
    const currentJob = await jobQueue.getJob(job.id);
    if (currentJob.state === 'completed') {
      completedCount++;
    }
  }

  console.log(`✓ Completed ${completedCount}/5 jobs`);

  if (completedCount >= 4) {
    console.log('✓ Multiple workers processed jobs successfully');
    return true;
  } else {
    console.log('✗ Not enough jobs completed');
    return false;
  }
}

async function testConfiguration() {
  console.log('\n=== Test 5: Configuration Management ===');

  const config = new Config();

  await config.set('max_retries', '5');
  const value = await config.get('max_retries');

  if (value === '5') {
    console.log('✓ Configuration set and retrieved successfully');

    await config.set('max_retries', '3');
    return true;
  } else {
    console.log('✗ Configuration test failed');
    return false;
  }
}

async function testJobPersistence() {
  console.log('\n=== Test 6: Job Persistence ===');

  const jobQueue = new JobQueue();

  const job = await jobQueue.enqueueJob({
    id: 'persistence-test-' + Date.now(),
    command: 'echo "Testing persistence"'
  });

  console.log('✓ Job created:', job.id);

  const retrievedJob = await jobQueue.getJob(job.id);

  if (retrievedJob && retrievedJob.id === job.id) {
    console.log('✓ Job persisted and retrieved successfully');
    return true;
  } else {
    console.log('✗ Job persistence test failed');
    return false;
  }
}

async function runAllTests() {
  console.log('='.repeat(50));
  console.log('QueueCTL Test Suite');
  console.log('='.repeat(50));

  const results = [];

  try {
    results.push(await testBasicJobCompletion());
  } catch (error) {
    console.error('Test 1 error:', error.message);
    results.push(false);
  }

  await sleep(2000);

  try {
    results.push(await testFailedJobRetry());
  } catch (error) {
    console.error('Test 2 error:', error.message);
    results.push(false);
  }

  await sleep(2000);

  try {
    results.push(await testDLQRetry());
  } catch (error) {
    console.error('Test 3 error:', error.message);
    results.push(false);
  }

  await sleep(2000);

  try {
    results.push(await testMultipleWorkers());
  } catch (error) {
    console.error('Test 4 error:', error.message);
    results.push(false);
  }

  await sleep(2000);

  try {
    results.push(await testConfiguration());
  } catch (error) {
    console.error('Test 5 error:', error.message);
    results.push(false);
  }

  await sleep(2000);

  try {
    results.push(await testJobPersistence());
  } catch (error) {
    console.error('Test 6 error:', error.message);
    results.push(false);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test Results');
  console.log('='.repeat(50));

  const passed = results.filter(r => r === true).length;
  const total = results.length;

  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

runAllTests();
