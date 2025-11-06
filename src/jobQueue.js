const { supabase } = require('./db');
const { v4: uuidv4 } = require('uuid');

class JobQueue {
  async enqueueJob(jobData) {
    const job = {
      id: jobData.id || uuidv4(),
      command: jobData.command,
      state: 'pending',
      attempts: 0,
      max_retries: jobData.max_retries || 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('jobs')
      .insert(job)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to enqueue job: ${error.message}`);
    }

    return data;
  }

  async getJob(jobId) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get job: ${error.message}`);
    }

    return data;
  }

  async listJobs(state = null) {
    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });

    if (state) {
      query = query.eq('state', state);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list jobs: ${error.message}`);
    }

    return data;
  }

  async updateJobState(jobId, state, additionalFields = {}) {
    const updates = {
      state,
      updated_at: new Date().toISOString(),
      ...additionalFields
    };

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update job state: ${error.message}`);
    }

    return data;
  }

  async acquireJobLock(workerId) {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 5 * 60 * 1000);

    const { data: pendingJobs, error: pendingError } = await supabase
      .from('jobs')
      .select('*')
      .eq('state', 'pending')
      .is('locked_by', null)
      .order('created_at', { ascending: true })
      .limit(1);

    if (pendingError) {
      throw new Error(`Failed to find pending jobs: ${pendingError.message}`);
    }

    if (pendingJobs && pendingJobs.length > 0) {
      const job = pendingJobs[0];

      const { data: lockedJob, error: lockError } = await supabase
        .from('jobs')
        .update({
          locked_by: workerId,
          locked_at: now.toISOString(),
          state: 'processing',
          updated_at: now.toISOString()
        })
        .eq('id', job.id)
        .is('locked_by', null)
        .select()
        .maybeSingle();

      if (!lockError && lockedJob) {
        return lockedJob;
      }
    }

    const { data: retryJobs, error: retryError } = await supabase
      .from('jobs')
      .select('*')
      .eq('state', 'failed')
      .not('next_retry_at', 'is', null)
      .lte('next_retry_at', now.toISOString())
      .is('locked_by', null)
      .order('next_retry_at', { ascending: true })
      .limit(1);

    if (retryError) {
      throw new Error(`Failed to find retry jobs: ${retryError.message}`);
    }

    if (retryJobs && retryJobs.length > 0) {
      const job = retryJobs[0];

      const { data: lockedJob, error: lockError } = await supabase
        .from('jobs')
        .update({
          locked_by: workerId,
          locked_at: now.toISOString(),
          state: 'processing',
          updated_at: now.toISOString()
        })
        .eq('id', job.id)
        .is('locked_by', null)
        .select()
        .maybeSingle();

      if (!lockError && lockedJob) {
        return lockedJob;
      }
    }

    const { data: staleLocks, error: staleError } = await supabase
      .from('jobs')
      .select('*')
      .eq('state', 'processing')
      .not('locked_by', 'is', null)
      .lt('locked_at', lockTimeout.toISOString())
      .limit(1);

    if (staleError) {
      throw new Error(`Failed to find stale locks: ${staleError.message}`);
    }

    if (staleLocks && staleLocks.length > 0) {
      const job = staleLocks[0];

      const { data: lockedJob, error: lockError } = await supabase
        .from('jobs')
        .update({
          locked_by: workerId,
          locked_at: now.toISOString(),
          state: 'processing',
          updated_at: now.toISOString()
        })
        .eq('id', job.id)
        .select()
        .maybeSingle();

      if (!lockError && lockedJob) {
        return lockedJob;
      }
    }

    return null;
  }

  async releaseJobLock(jobId) {
    const { error } = await supabase
      .from('jobs')
      .update({
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to release job lock: ${error.message}`);
    }
  }

  async markJobCompleted(jobId) {
    return await this.updateJobState(jobId, 'completed', {
      completed_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
      error_message: null
    });
  }

  async markJobFailed(jobId, errorMessage, backoffBase = 2) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.max_retries) {
      return await this.updateJobState(jobId, 'dead', {
        attempts: newAttempts,
        error_message: errorMessage,
        locked_by: null,
        locked_at: null,
        next_retry_at: null
      });
    }

    const delaySeconds = Math.pow(backoffBase, newAttempts);
    const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

    return await this.updateJobState(jobId, 'failed', {
      attempts: newAttempts,
      error_message: errorMessage,
      next_retry_at: nextRetryAt.toISOString(),
      locked_by: null,
      locked_at: null
    });
  }

  async getJobStats() {
    const { data, error } = await supabase
      .from('jobs')
      .select('state');

    if (error) {
      throw new Error(`Failed to get job stats: ${error.message}`);
    }

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      total: data.length
    };

    data.forEach(job => {
      if (stats.hasOwnProperty(job.state)) {
        stats[job.state]++;
      }
    });

    return stats;
  }

  async listDLQ() {
    return await this.listJobs('dead');
  }

  async retryDLQJob(jobId) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.state !== 'dead') {
      throw new Error(`Job ${jobId} is not in DLQ (state: ${job.state})`);
    }

    return await this.updateJobState(jobId, 'pending', {
      attempts: 0,
      error_message: null,
      next_retry_at: null,
      locked_by: null,
      locked_at: null
    });
  }
}

module.exports = JobQueue;

