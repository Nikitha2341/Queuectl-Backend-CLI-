/*
  # QueueCTL Jobs System Schema

  ## Overview
  Creates the core database schema for the queuectl job queue system with jobs, config, and worker tracking.

  ## New Tables
  
  ### `jobs`
  Main job queue table storing all job information and state
  - `id` (text, primary key) - Unique job identifier
  - `command` (text, required) - Shell command to execute
  - `state` (text, required) - Job state: pending, processing, completed, failed, dead
  - `attempts` (integer, default 0) - Number of execution attempts
  - `max_retries` (integer, default 3) - Maximum retry attempts before moving to DLQ
  - `created_at` (timestamptz, default now()) - Job creation timestamp
  - `updated_at` (timestamptz, default now()) - Last update timestamp
  - `next_retry_at` (timestamptz, nullable) - Scheduled time for next retry
  - `error_message` (text, nullable) - Last error message if failed
  - `completed_at` (timestamptz, nullable) - Completion timestamp
  - `locked_by` (text, nullable) - Worker ID that locked this job
  - `locked_at` (timestamptz, nullable) - Lock timestamp
  
  ### `config`
  System configuration key-value store
  - `key` (text, primary key) - Configuration key
  - `value` (text, required) - Configuration value
  - `updated_at` (timestamptz, default now()) - Last update timestamp
  
  ### `workers`
  Active worker tracking
  - `id` (text, primary key) - Worker identifier
  - `status` (text, required) - Worker status: active, stopping, stopped
  - `started_at` (timestamptz, default now()) - Worker start time
  - `last_heartbeat` (timestamptz, default now()) - Last heartbeat timestamp
  - `jobs_processed` (integer, default 0) - Total jobs processed
  
  ## Security
  - RLS enabled on all tables
  - Policies allow service role access for system operations
  
  ## Indexes
  - Jobs indexed by state for efficient querying
  - Jobs indexed by next_retry_at for retry scheduling
  - Jobs indexed by locked_by for worker tracking
*/

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  command text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz,
  error_message text,
  completed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  CONSTRAINT valid_state CHECK (state IN ('pending', 'processing', 'completed', 'failed', 'dead'))
);

-- Create indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_next_retry ON jobs(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_locked_by ON jobs(locked_by) WHERE locked_by IS NOT NULL;

-- Create config table
CREATE TABLE IF NOT EXISTS config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create workers table
CREATE TABLE IF NOT EXISTS workers (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  jobs_processed integer NOT NULL DEFAULT 0,
  CONSTRAINT valid_worker_status CHECK (status IN ('active', 'stopping', 'stopped'))
);

-- Insert default configuration
INSERT INTO config (key, value) VALUES 
  ('max_retries', '3'),
  ('backoff_base', '2')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role full access to jobs"
  ON jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to config"
  ON config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to workers"
  ON workers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);