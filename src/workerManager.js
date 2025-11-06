const Worker = require('./worker');

const { supabase } = require('./db');

class WorkerManager {
  constructor() {
    this.workers = [];
  }

  async startWorkers(count = 1) {
    console.log(`Starting ${count} worker(s)...`);

    for (let i = 0; i < count; i++) {
      const worker = new Worker();
      this.workers.push(worker);

      worker.start().catch(error => {
        console.error(`Worker ${worker.workerId} crashed: ${error.message}`);
      });

      await this.sleep(100);
    }

    console.log(`${count} worker(s) started successfully`);
    return this.workers;
  }

  async stopAllWorkers() {
    console.log(`Stopping ${this.workers.length} worker(s)...`);

    const stopPromises = this.workers.map(worker => worker.stop());
    await Promise.all(stopPromises);

    this.workers = [];
    console.log('All workers stopped');
  }

  async getActiveWorkers() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .in('status', ['active', 'stopping'])
      .gte('last_heartbeat', fiveMinutesAgo)
      .order('started_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active workers: ${error.message}`);
    }

    return data;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { WorkerManager };
