# QueueCTL - Background Job Queue System

A production-grade, CLI-based background job queue system with worker processes, automatic retry with exponential backoff, and Dead Letter Queue (DLQ) support.

## Features

- **CLI Interface** - Complete command-line interface for all operations
- **Background Workers** - Multiple concurrent worker processes
- **Automatic Retry** - Exponential backoff for failed jobs
- **Dead Letter Queue** - Permanent storage for failed jobs after max retries
- **Persistent Storage** - Job data survives restarts using Supabase
- **Job Locking** - Prevents duplicate processing across workers
- **Graceful Shutdown** - Workers finish current job before stopping
- **Configuration Management** - Configurable retry and backoff settings
- **Real-time Status** - Monitor job states and active workers

## Prerequisites

- Node.js (v14 or higher)
- Supabase account and database (already configured in this project)

## Installation

```bash
npm install
```

## Setup

The project is pre-configured with Supabase. The database schema has been created with the following tables:

- `jobs` - Stores all job information and state
- `config` - System configuration key-value store
- `workers` - Tracks active worker processes

## Usage

### Basic Commands

#### Enqueue a Job

Add a new job to the queue:

```bash
node queuectl.js enqueue '{"id":"job1","command":"echo Hello World"}'
```

With custom max retries:

```bash
node queuectl.js enqueue '{"id":"job2","command":"sleep 2","max_retries":5}'
```

#### Start Workers

Start one worker:

```bash
node queuectl.js worker start
```

Start multiple workers:

```bash
node queuectl.js worker start --count 3
```

Workers run continuously and will process jobs until stopped with `Ctrl+C`.

#### Check Status

View summary of all job states and active workers:

```bash
node queuectl.js status
```

Example output:

```
=== Job Queue Status ===

Total Jobs:       10
Pending:          3
Processing:       1
Completed:        4
Failed (Retrying): 1
Dead (DLQ):       1

=== Active Workers ===

Active Workers:   2

Worker ID:        worker-abc123
Status:           active
Jobs Processed:   5
Started:          1/5/2025, 10:30:00 AM
Last Heartbeat:   1/5/2025, 10:35:00 AM
---
```

#### List Jobs

List all jobs:

```bash
node queuectl.js list
```

Filter by state:

```bash
node queuectl.js list --state pending
node queuectl.js list --state completed
node queuectl.js list --state failed
node queuectl.js list --state dead
```

#### Dead Letter Queue (DLQ)

List jobs in DLQ:

```bash
node queuectl.js dlq list
```

Retry a job from DLQ:

```bash
node queuectl.js dlq retry job1
```

#### Configuration

Set configuration value:

```bash
node queuectl.js config set max-retries 5
node queuectl.js config set backoff-base 3
```

Get configuration value:

```bash
node queuectl.js config get max-retries
```

List all configuration:

```bash
node queuectl.js config list
```

## Architecture Overview

### Job Lifecycle

```
pending -> processing -> completed
             ↓
           failed (with retry) -> processing (retry) -> completed
             ↓
           dead (DLQ)
```

1. **pending** - Job is waiting to be picked up by a worker
2. **processing** - Job is currently being executed by a worker
3. **completed** - Job executed successfully
4. **failed** - Job failed but will be retried based on backoff schedule
5. **dead** - Job permanently failed after exhausting all retries (moved to DLQ)

### Components

#### JobQueue (`src/jobQueue.js`)

Core queue management:
- Enqueue new jobs
- Acquire job locks with concurrency control
- Update job states
- Manage retry scheduling
- Handle DLQ operations

#### Worker (`src/worker.js`)

Job execution process:
- Polls queue for available jobs
- Executes shell commands
- Handles failures and success
- Implements graceful shutdown
- Sends heartbeats for monitoring

#### WorkerManager (`src/workerManager.js`)

Worker orchestration:
- Start multiple workers
- Stop all workers gracefully
- Track active workers
- Monitor worker health

#### Config (`src/config.js`)

Configuration management:
- Get/set configuration values
- Persistent storage in database

### Retry Mechanism

Failed jobs automatically retry with exponential backoff:

```
delay = backoff_base ^ attempts
```

Default configuration:
- `max_retries`: 3
- `backoff_base`: 2

Example retry schedule:
- Attempt 1: immediate
- Attempt 2: 2 seconds later (2^1)
- Attempt 3: 4 seconds later (2^2)
- After attempt 3: moved to DLQ

### Concurrency Control

Jobs are protected from duplicate processing using database-level locking:

1. Worker queries for available jobs (pending or ready for retry)
2. Worker attempts to lock job by setting `locked_by` field
3. Only one worker can successfully lock a job
4. Stale locks (>5 minutes) are automatically recovered

### Data Persistence

All job data is stored in Supabase (PostgreSQL):

- Jobs survive application restarts
- Configuration persists across sessions
- Worker tracking for monitoring
- Full job history maintained

## Testing

Run the test suite:

```bash
npm test
```

The test suite validates:

1. ✓ Basic job completion
2. ✓ Failed job retry with exponential backoff
3. ✓ DLQ retry functionality
4. ✓ Multiple workers processing jobs concurrently
5. ✓ Configuration management
6. ✓ Job persistence across operations

## Example Workflows

### Example 1: Simple Job Processing

```bash
# Start a worker in one terminal
node queuectl.js worker start

# In another terminal, enqueue jobs
node queuectl.js enqueue '{"command":"echo Job 1"}'
node queuectl.js enqueue '{"command":"echo Job 2"}'
node queuectl.js enqueue '{"command":"echo Job 3"}'

# Check status
node queuectl.js status

# List completed jobs
node queuectl.js list --state completed
```

### Example 2: Handling Failures

```bash
# Start a worker
node queuectl.js worker start

# Enqueue a job that will fail
node queuectl.js enqueue '{"id":"failing-job","command":"invalid-command"}'

# Watch it retry (check status periodically)
node queuectl.js status

# After max retries, check DLQ
node queuectl.js dlq list

# Retry the job (after fixing the issue)
node queuectl.js dlq retry failing-job
```

### Example 3: Multiple Workers

```bash
# Start 3 workers in terminal 1
node queuectl.js worker start --count 3

# In terminal 2, enqueue multiple jobs
for i in {1..10}; do
  node queuectl.js enqueue "{\"command\":\"sleep 2 && echo Job $i\"}"
done

# Monitor progress
watch -n 1 'node queuectl.js status'
```

### Example 4: Configuration Tuning

```bash
# Increase retry attempts
node queuectl.js config set max-retries 5

# Increase backoff (longer delays between retries)
node queuectl.js config set backoff-base 3

# View current config
node queuectl.js config list

# Enqueue job with new settings
node queuectl.js enqueue '{"command":"maybe-failing-job"}'
```

## Project Structure

```
queuectl/
├── queuectl.js           # Main CLI entry point
├── src/
│   ├── db.js            # Supabase connection
│   ├── jobQueue.js      # Core queue logic
│   ├── worker.js        # Worker process
│   ├── workerManager.js # Worker orchestration
│   └── config.js        # Configuration management
├── tests/
│   └── test.js          # Test suite
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## Design Decisions & Trade-offs

### Database Choice

**Decision**: Use Supabase (PostgreSQL) for persistence

**Rationale**:
- Production-grade reliability
- ACID transactions for job locking
- Built-in replication and backups
- Real-time capabilities for future enhancements

**Trade-offs**:
- Requires network connection
- Slightly higher latency than file-based storage
- More complex setup than SQLite

### Locking Strategy

**Decision**: Database-level optimistic locking with stale lock recovery

**Rationale**:
- Prevents race conditions across multiple workers
- Handles worker crashes gracefully
- Simple implementation without external lock service

**Trade-offs**:
- Lock recovery timeout (5 minutes) may delay job processing if worker crashes
- Database round-trip for every lock operation

### Worker Architecture

**Decision**: Long-running processes that poll for jobs

**Rationale**:
- Simple to implement and understand
- Works with any database
- Easy to scale horizontally

**Trade-offs**:
- Polling introduces latency (1 second default)
- Workers consume resources even when idle
- Alternative: Could use PostgreSQL LISTEN/NOTIFY for push-based notifications

### Command Execution

**Decision**: Execute shell commands directly using Node.js `child_process.exec`

**Rationale**:
- Maximum flexibility for job types
- Leverages existing shell tools
- Simple interface

**Trade-offs**:
- Security risk if commands are user-provided (need sanitization in production)
- Limited to commands available on host system
- 60-second timeout prevents runaway processes

### Retry Strategy

**Decision**: Exponential backoff with configurable base and max retries

**Rationale**:
- Industry standard approach
- Prevents overwhelming downstream services
- Adaptable to different failure scenarios

**Trade-offs**:
- Long delays for later retries (2^3 = 8 seconds for 3rd retry)
- Fixed formula may not suit all job types

## Known Limitations

1. **No Job Priority** - Jobs are processed in FIFO order only
2. **No Scheduled Jobs** - Cannot schedule jobs for future execution
3. **No Job Output Capture** - Command stdout/stderr not stored
4. **No Job Timeout Configuration** - Fixed 60-second timeout
5. **No Job Dependencies** - Cannot chain jobs or create workflows
6. **No Batch Operations** - Cannot enqueue multiple jobs in one command

## Future Enhancements

Potential improvements for production use:

- [ ] Job priority queues
- [ ] Scheduled/delayed job execution
- [ ] Job output logging and retrieval
- [ ] Configurable job timeouts
- [ ] Job dependencies and workflows
- [ ] Web dashboard for monitoring
- [ ] Metrics and analytics (throughput, latency, failure rates)
- [ ] Job tags and filtering
- [ ] Bulk job operations
- [ ] Webhook notifications on job completion
- [ ] Rate limiting per job type
- [ ] Job execution history and audit logs

## Troubleshooting

### Workers not processing jobs

1. Check if workers are running: `node queuectl.js status`
2. Verify database connection in `.env` file
3. Check for stale locks: Look for jobs in "processing" state for >5 minutes

### Jobs stuck in "processing" state

- Wait 5 minutes for stale lock recovery
- Or manually release lock by updating job state to "pending" in database

### Jobs moving to DLQ immediately

- Check `max_retries` configuration: `node queuectl.js config get max-retries`
- Verify job's `max_retries` field wasn't set to 0

### Database connection errors

- Verify Supabase credentials in `.env` file
- Check network connectivity
- Ensure Supabase project is active

## License

MIT

## Contributing

This is an assignment submission. For production use, consider the enhancements listed above.
