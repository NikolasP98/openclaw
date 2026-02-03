<script lang="ts">
  import { onMount } from 'svelte';
  import type { OpenClawConfig } from './types';
  import GatewaySection from './components/GatewaySection.svelte';
  import AgentsSection from './components/AgentsSection.svelte';
  import BindingsSection from './components/BindingsSection.svelte';

  let config: OpenClawConfig = {};
  let originalConfig: string = '';
  let isDirty = false;
  let loading = false;
  let error = '';
  let success = '';

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }
      const data = await response.json();
      config = data;
      originalConfig = JSON.stringify(data);
      isDirty = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config';
      console.error('Error loading config:', err);
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    loading = true;
    error = '';
    success = '';
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save config: ${response.statusText}`);
      }

      originalConfig = JSON.stringify(config);
      isDirty = false;
      success = 'Configuration saved successfully! Changes will be hot-reloaded.';

      setTimeout(() => {
        success = '';
      }, 5000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save config';
      console.error('Error saving config:', err);
    } finally {
      loading = false;
    }
  }

  function handleConfigChange() {
    isDirty = JSON.stringify(config) !== originalConfig;
  }

  function resetConfig() {
    config = JSON.parse(originalConfig);
    isDirty = false;
    error = '';
    success = '';
  }

  $: handleConfigChange(), config;
</script>

<main>
  <div class="header">
    <h1>OpenClaw Configuration Editor</h1>
    {#if isDirty}
      <span class="dirty-indicator">● Unsaved changes</span>
    {/if}
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if success}
    <div class="success">{success}</div>
  {/if}

  {#if loading && !config.gateway}
    <div class="card">Loading configuration...</div>
  {:else}
    <GatewaySection bind:config />
    <AgentsSection bind:config />
    <BindingsSection bind:config />

    <div class="button-group">
      <button
        class="primary"
        on:click={saveConfig}
        disabled={!isDirty || loading}
      >
        {loading ? 'Saving...' : 'Save Configuration'}
      </button>

      <button
        class="secondary"
        on:click={resetConfig}
        disabled={!isDirty || loading}
      >
        Reset Changes
      </button>

      <button
        class="secondary"
        on:click={loadConfig}
        disabled={loading}
      >
        Reload from File
      </button>
    </div>
  {/if}
</main>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
</style>
