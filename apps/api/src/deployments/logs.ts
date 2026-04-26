import { randomUUID } from "node:crypto";

import { db } from "../db/client";
import { deploymentLogs } from "../db/schema";

type DeploymentLogListener = (log: {
  id: string;
  deploymentId: string;
  timestamp: string;
  stream: string;
  message: string;
}) => void;

const deploymentLogListeners = new Map<string, Set<DeploymentLogListener>>();

export async function appendDeploymentLog(deploymentId: string, stream: string, message: string) {
  const log = {
    id: randomUUID(),
    deploymentId,
    timestamp: new Date(),
    stream,
    message,
  };

  await db.insert(deploymentLogs).values(log);

  const listeners = deploymentLogListeners.get(deploymentId);
  if (!listeners?.size) {
    return log;
  }

  const event = {
    ...log,
    timestamp: log.timestamp.toISOString(),
  };

  for (const listener of listeners) {
    listener(event);
  }

  return log;
}

export function subscribeToDeploymentLogs(deploymentId: string, listener: DeploymentLogListener) {
  const listeners = deploymentLogListeners.get(deploymentId) ?? new Set<DeploymentLogListener>();
  listeners.add(listener);
  deploymentLogListeners.set(deploymentId, listeners);

  return () => {
    const currentListeners = deploymentLogListeners.get(deploymentId);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      deploymentLogListeners.delete(deploymentId);
    }
  };
}
