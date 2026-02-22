export type NodeSendEventFn = (opts: {
  nodeId: string;
  event: string;
  payloadJSON?: string | null;
}) => void;

export type NodeListConnectedFn = () => Array<{ nodeId: string }>;

export type NodeSubscriptionManager = {
  subscribe: (nodeId: string, sessionKey: string, connId?: string) => void;
  unsubscribe: (nodeId: string, sessionKey: string) => void;
  unsubscribeAll: (nodeId: string, connId?: string) => void;
  sendToSession: (
    sessionKey: string,
    event: string,
    payload: unknown,
    sendEvent?: NodeSendEventFn | null,
  ) => void;
  sendToAllSubscribed: (
    event: string,
    payload: unknown,
    sendEvent?: NodeSendEventFn | null,
  ) => void;
  sendToAllConnected: (
    event: string,
    payload: unknown,
    listConnected?: NodeListConnectedFn | null,
    sendEvent?: NodeSendEventFn | null,
  ) => void;
  clear: () => void;
};

export function createNodeSubscriptionManager(): NodeSubscriptionManager {
  // nodeId → Map<sessionKey, registeredConnId> (empty string if no connId provided)
  const nodeSubscriptions = new Map<string, Map<string, string>>();
  const sessionSubscribers = new Map<string, Set<string>>();

  const toPayloadJSON = (payload: unknown) => (payload ? JSON.stringify(payload) : null);

  const subscribe = (nodeId: string, sessionKey: string, connId?: string) => {
    const normalizedNodeId = nodeId.trim();
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedNodeId || !normalizedSessionKey) {
      return;
    }

    let nodeMap = nodeSubscriptions.get(normalizedNodeId);
    if (!nodeMap) {
      nodeMap = new Map<string, string>();
      nodeSubscriptions.set(normalizedNodeId, nodeMap);
    }
    // Always update the connId so the latest connection owns this subscription.
    nodeMap.set(normalizedSessionKey, connId ?? "");

    let sessionSet = sessionSubscribers.get(normalizedSessionKey);
    if (!sessionSet) {
      sessionSet = new Set<string>();
      sessionSubscribers.set(normalizedSessionKey, sessionSet);
    }
    sessionSet.add(normalizedNodeId);
  };

  const unsubscribe = (nodeId: string, sessionKey: string) => {
    const normalizedNodeId = nodeId.trim();
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedNodeId || !normalizedSessionKey) {
      return;
    }

    const nodeMap = nodeSubscriptions.get(normalizedNodeId);
    nodeMap?.delete(normalizedSessionKey);
    if (nodeMap?.size === 0) {
      nodeSubscriptions.delete(normalizedNodeId);
    }

    const sessionSet = sessionSubscribers.get(normalizedSessionKey);
    sessionSet?.delete(normalizedNodeId);
    if (sessionSet?.size === 0) {
      sessionSubscribers.delete(normalizedSessionKey);
    }
  };

  const unsubscribeAll = (nodeId: string, connId?: string) => {
    const normalizedNodeId = nodeId.trim();
    const nodeMap = nodeSubscriptions.get(normalizedNodeId);
    if (!nodeMap) {
      return;
    }
    for (const [sessionKey, registeredConnId] of nodeMap) {
      // If a connId is provided, only remove subscriptions that were registered
      // by that specific connection. This prevents a stale close event from
      // wiping subscriptions that belong to a newer reconnected connection.
      if (connId && registeredConnId && registeredConnId !== connId) {
        continue;
      }
      nodeMap.delete(sessionKey);
      const sessionSet = sessionSubscribers.get(sessionKey);
      sessionSet?.delete(normalizedNodeId);
      if (sessionSet?.size === 0) {
        sessionSubscribers.delete(sessionKey);
      }
    }
    if (nodeMap.size === 0) {
      nodeSubscriptions.delete(normalizedNodeId);
    }
  };

  const sendToSession = (
    sessionKey: string,
    event: string,
    payload: unknown,
    sendEvent?: NodeSendEventFn | null,
  ) => {
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedSessionKey || !sendEvent) {
      return;
    }
    const subs = sessionSubscribers.get(normalizedSessionKey);
    if (!subs || subs.size === 0) {
      return;
    }

    const payloadJSON = toPayloadJSON(payload);
    for (const nodeId of subs) {
      sendEvent({ nodeId, event, payloadJSON });
    }
  };

  const sendToAllSubscribed = (
    event: string,
    payload: unknown,
    sendEvent?: NodeSendEventFn | null,
  ) => {
    if (!sendEvent) {
      return;
    }
    const payloadJSON = toPayloadJSON(payload);
    for (const nodeId of nodeSubscriptions.keys()) {
      sendEvent({ nodeId, event, payloadJSON });
    }
  };

  const sendToAllConnected = (
    event: string,
    payload: unknown,
    listConnected?: NodeListConnectedFn | null,
    sendEvent?: NodeSendEventFn | null,
  ) => {
    if (!sendEvent || !listConnected) {
      return;
    }
    const payloadJSON = toPayloadJSON(payload);
    for (const node of listConnected()) {
      sendEvent({ nodeId: node.nodeId, event, payloadJSON });
    }
  };

  const clear = () => {
    nodeSubscriptions.clear();
    sessionSubscribers.clear();
  };

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    sendToSession,
    sendToAllSubscribed,
    sendToAllConnected,
    clear,
  };
}
