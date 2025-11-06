# QueueCTL - Setup Guide

## Download & Extract

If you have the `queuectl-project.tar.gz` file:

```bash
tar -xzf queuectl-project.tar.gz
cd project
```

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase

You have two options:

#### Option A: Use Your Own Supabase (Recommended for persistence)

1. Create a free account at [https://supabase.com](https://supabase.com)
2. Create a new project
3. Get your project URL and anon key from: Settings → API
4. Update the `.env` file:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Apply the database migration:

The migration file is already in `supabase/migrations/20251105083905_create_jobs_system.sql`

You can apply it by:
- Going to your Supabase project → SQL Editor
- Copying the contents of the migration file
- Running it in the SQL Editor

#### Option B: Keep Existing Config (Temporary)

The project includes demo credentials, but this database may be deleted or reset. Only use for testing.

### 3. Verify Setup

```bash
# Test the CLI
node queuectl.js --help

# Check configuration
node queuectl.js config list

# Run the build command
npm run build
```

### 4. Test Everything Works

```bash
# Run the test suite
npm test
```

Note: Tests will take 30-60 seconds to complete and will test all functionality.

## Quick Start

### Terminal 1 - Start Workers
```bash
node queuectl.js worker start --count 2
```

### Terminal 2 - Create Jobs
```bash
node queuectl.js enqueue '{"command":"echo Hello World!"}'
node queuectl.js status
```

## Making it Globally Available

To use `queuectl` from anywhere:

```bash
# Install globally
npm link

# Now you can use it anywhere
queuectl status
queuectl enqueue '{"command":"echo test"}'
```

## Troubleshooting

### "Failed to get config" or database errors

- Verify your `.env` file has correct Supabase credentials
- Make sure you applied the migration SQL
- Check network connectivity

### "Command not found" errors

- Ensure you're in the project directory
- Or use `npm link` to install globally

### Jobs not processing

- Make sure at least one worker is running
- Check `queuectl status` to see active workers
- Verify database connection

## Project Structure

```
queuectl/
├── queuectl.js           # Main CLI (run this)
├── src/
│   ├── db.js            # Database connection
│   ├── jobQueue.js      # Queue logic
│   ├── worker.js        # Worker process
│   ├── workerManager.js # Worker management
│   └── config.js        # Configuration
├── tests/
│   └── test.js          # Test suite
├── supabase/
│   └── migrations/      # Database schema
├── package.json
├── .env                 # Configuration (edit this!)
├── README.md           # Full documentation
└── SETUP.md            # This file
```

## Next Steps

1. Read the full documentation in `README.md`
2. Try the examples in the "Usage" section
3. Run `npm test` to see all features in action
4. Start building your own job processing system!

## Support

For issues or questions:
- Check `README.md` for detailed documentation
- Review the "Troubleshooting" section
- Examine the test suite in `tests/test.js` for examples

Enjoy using QueueCTL!
