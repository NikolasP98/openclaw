<script lang="ts">
  import { onMount } from 'svelte';
  import type { OpenClawConfig } from './types';
  import GatewaySection from './lib/GatewaySection.svelte';
  import AgentsSection from './lib/AgentsSection.svelte';
  import BindingsSection from './lib/BindingsSection.svelte';

  let config = $state<OpenClawConfig>({});
  let originalConfig = $state('');
  let isDirty = $derived(JSON.stringify(config) !== originalConfig);
  let loading = $state(false);
  let error = $state('');
  let success = $state('');

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

  function resetConfig() {
    config = JSON.parse(originalConfig);
    error = '';
    success = '';
  }
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
    <GatewaySection {config} />
    <AgentsSection {config} />
    <BindingsSection {config} />

    <div class="button-group">
      <button
        class="primary"
        onclick={saveConfig}
        disabled={!isDirty || loading}
      >
        {loading ? 'Saving...' : 'Save Configuration'}
      </button>

      <button
        class="secondary"
        onclick={resetConfig}
        disabled={!isDirty || loading}
      >
        Reset Changes
      </button>

      <button
        class="secondary"
        onclick={loadConfig}
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
    flex-wrap: wrap;
  }
</style>
