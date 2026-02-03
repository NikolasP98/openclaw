<script lang="ts">
  import type { OpenClawConfig, AgentBinding } from '../types';

  export let config: OpenClawConfig;

  $: if (!config.bindings) config.bindings = [];

  function addBinding() {
    config.bindings = [
      ...config.bindings!,
      {
        agentId: '',
        match: { channel: '' }
      }
    ];
  }

  function removeBinding(index: number) {
    config.bindings = config.bindings!.filter((_, i) => i !== index);
  }
</script>

<div class="card">
  <h2>Agent Bindings</h2>
  <p class="description">
    Define which agents handle messages from specific channels. Changes are hot-reloaded instantly!
  </p>

  {#if config.bindings && config.bindings.length > 0}
    {#each config.bindings as binding, index}
      <div class="array-item">
        <div class="array-item-header">
          <h3>Binding {index + 1}</h3>
          <button class="remove-btn" on:click={() => removeBinding(index)}>
            Remove
          </button>
        </div>

        <div class="form-group">
          <label for="binding-agent-{index}">
            Agent ID *
            <input
              id="binding-agent-{index}"
              type="text"
              bind:value={binding.agentId}
              placeholder="e.g., main, support-agent"
              required
            />
          </label>
          <small>The agent that will handle messages for this binding</small>
        </div>

        <h4>Match Criteria</h4>

        <div class="form-group">
          <label for="binding-channel-{index}">
            Channel *
            <select id="binding-channel-{index}" bind:value={binding.match.channel}>
              <option value="">Select channel</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="signal">Signal</option>
              <option value="imessage">iMessage</option>
            </select>
          </label>
        </div>

        <div class="form-group">
          <label for="binding-account-{index}">
            Account ID (optional)
            <input
              id="binding-account-{index}"
              type="text"
              bind:value={binding.match.accountId}
              placeholder="e.g., bot-123"
            />
          </label>
          <small>Match specific account. Use "*" for all accounts or leave empty for default.</small>
        </div>

        <div class="form-group">
          <label for="binding-guild-{index}">
            Guild ID (optional, Discord only)
            <input
              id="binding-guild-{index}"
              type="text"
              bind:value={binding.match.guildId}
              placeholder="e.g., 123456789"
            />
          </label>
        </div>

        <div class="form-group">
          <label for="binding-team-{index}">
            Team ID (optional, Slack only)
            <input
              id="binding-team-{index}"
              type="text"
              bind:value={binding.match.teamId}
              placeholder="e.g., T123456"
            />
          </label>
        </div>
      </div>
    {/each}
  {:else}
    <p>No bindings configured. Add a binding to route messages to agents.</p>
  {/if}

  <button class="add-btn" on:click={addBinding}>
    + Add Binding
  </button>
</div>

<style>
  .description {
    color: rgba(255, 255, 255, 0.7);
    margin: 0.5rem 0 1.5rem 0;
    font-size: 0.95rem;
  }

  h3 {
    font-size: 1.1rem;
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
  }

  h4 {
    font-size: 1rem;
    margin: 1.5rem 0 1rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  p {
    color: rgba(255, 255, 255, 0.6);
    margin: 1rem 0;
  }

  small {
    display: block;
    margin-top: 0.25rem;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  @media (prefers-color-scheme: light) {
    .description {
      color: rgba(0, 0, 0, 0.6);
    }

    h3 {
      color: rgba(0, 0, 0, 0.8);
    }

    h4 {
      color: rgba(0, 0, 0, 0.7);
    }

    p {
      color: rgba(0, 0, 0, 0.5);
    }

    small {
      color: rgba(0, 0, 0, 0.5);
    }
  }
</style>
