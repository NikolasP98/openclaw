# OpenClaw Config Editor

A Svelte-based web UI for editing the `openclaw.json` configuration file.

## Features

- **Live Config Editing**: Edit gateway settings, agents, and bindings in a user-friendly interface
- **Change Detection**: Visual indicator when changes are unsaved
- **Hot-Reload Support**: Changes are automatically hot-reloaded by the gateway (instant binding updates!)
- **Validation**: Input validation and error handling
- **Responsive Design**: Works on desktop and mobile browsers

## Development

```bash
# Install dependencies
npm install

# Run development server (with API proxy to gateway)
npm run dev

# Build for production
npm run build
```

## Usage

1. Make sure the OpenClaw gateway is running on `localhost:18789`
2. Open `http://localhost:5174` in your browser
3. Edit the configuration using the forms
4. Click "Save Configuration" to write changes to `openclaw.json`
5. Changes are automatically hot-reloaded by the gateway

## Architecture

- **Frontend**: Svelte 5 with TypeScript
- **API**: REST endpoints at `/api/config` (GET, PUT)
- **Build**: Vite for fast development and optimized production builds

## Components

- `App.svelte` - Main application component
- `GatewaySection.svelte` - Gateway and hot-reload settings
- `AgentsSection.svelte` - Agent configuration
- `BindingsSection.svelte` - Agent routing bindings

## API Endpoints

- `GET /api/config` - Read current configuration
- `PUT /api/config` - Update configuration (writes to `openclaw.json`)
