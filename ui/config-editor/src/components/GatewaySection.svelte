<script lang="ts">
  import type { OpenClawConfig } from '../types';

  export let config: OpenClawConfig;

  $: if (!config.gateway) config.gateway = {};
  $: if (!config.gateway.reload) config.gateway.reload = {};
</script>

<div class="card">
  <h2>Gateway Configuration</h2>

  <div class="form-group">
    <label for="gateway-mode">
      Mode
      <select id="gateway-mode" bind:value={config.gateway.mode}>
        <option value="">Not set</option>
        <option value="local">Local</option>
        <option value="remote">Remote</option>
      </select>
    </label>
  </div>

  <h3>Hot Reload Settings</h3>

  <div class="form-group">
    <label for="reload-mode">
      Reload Mode
      <select id="reload-mode" bind:value={config.gateway.reload.mode}>
        <option value="">Default (hybrid)</option>
        <option value="off">Off</option>
        <option value="restart">Restart</option>
        <option value="hot">Hot</option>
        <option value="hybrid">Hybrid</option>
      </select>
    </label>
    <small>Controls how configuration changes are applied</small>
  </div>

  <div class="form-group">
    <label for="debounce-ms">
      Debounce (ms)
      <input
        id="debounce-ms"
        type="number"
        bind:value={config.gateway.reload.debounceMs}
        placeholder="300"
        min="0"
        step="50"
      />
    </label>
    <small>Wait time after file change before reloading (default: 300ms)</small>
  </div>
</div>

<style>
  h3 {
    font-size: 1.2rem;
    margin: 1.5rem 0 1rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  small {
    display: block;
    margin-top: 0.25rem;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  @media (prefers-color-scheme: light) {
    h3 {
      color: rgba(0, 0, 0, 0.7);
    }

    small {
      color: rgba(0, 0, 0, 0.5);
    }
  }
</style>
