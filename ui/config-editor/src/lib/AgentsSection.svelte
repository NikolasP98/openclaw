<script lang="ts">
  import type { OpenClawConfig } from '../types';

  let { config }: { config: OpenClawConfig } = $props();

  $effect(() => {
    if (!config.agents) config.agents = {};
    if (!config.agents.list) config.agents.list = [];
  });

  function addAgent() {
    config.agents!.list = [
      ...(config.agents!.list || []),
      { id: '', name: '' }
    ];
  }

  function removeAgent(index: number) {
    config.agents!.list = config.agents!.list!.filter((_, i) => i !== index);
  }
</script>

<div class="card">
  <h2>Agents</h2>

  {#if config.agents?.list && config.agents.list.length > 0}
    {#each config.agents.list as agent, index}
      <div class="array-item">
        <div class="array-item-header">
          <h3>Agent {index + 1}</h3>
          <button class="remove-btn" onclick={() => removeAgent(index)}>
            Remove
          </button>
        </div>

        <div class="form-group">
          <label for="agent-id-{index}">
            Agent ID *
            <input
              id="agent-id-{index}"
              type="text"
              bind:value={agent.id}
              placeholder="e.g., main, support-agent"
              required
            />
          </label>
        </div>

        <div class="form-group">
          <label for="agent-name-{index}">
            Name
            <input
              id="agent-name-{index}"
              type="text"
              bind:value={agent.name}
              placeholder="e.g., Main Agent"
            />
          </label>
        </div>

        <div class="form-group">
          <label for="agent-workspace-{index}">
            Workspace Path
            <input
              id="agent-workspace-{index}"
              type="text"
              bind:value={agent.workspace}
              placeholder="e.g., /home/node/.openclaw/workspace"
            />
          </label>
        </div>

        <div class="form-group">
          <label for="agent-model-{index}">
            Model
            <input
              id="agent-model-{index}"
              type="text"
              bind:value={agent.model}
              placeholder="e.g., anthropic/claude-sonnet-3.5"
            />
          </label>
        </div>
      </div>
    {/each}
  {:else}
    <p>No agents configured. Add an agent to get started.</p>
  {/if}

  <button class="add-btn" onclick={addAgent}>
    + Add Agent
  </button>
</div>

<style>
  h3 {
    font-size: 1.1rem;
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
  }

  p {
    color: rgba(255, 255, 255, 0.6);
    margin: 1rem 0;
  }

  @media (prefers-color-scheme: light) {
    h3 {
      color: rgba(0, 0, 0, 0.8);
    }
    p {
      color: rgba(0, 0, 0, 0.5);
    }
  }
</style>
