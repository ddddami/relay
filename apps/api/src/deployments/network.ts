const commonRuntimePorts = [3000, 4321, 4173, 8080, 80] as const;

export async function findReachableContainerPort(containerId: string, path = "/") {
  for (const port of commonRuntimePorts) {
    try {
      const response = await fetch(`http://${containerId}:${port}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1500),
      });

      if (response.status >= 100) {
        return port;
      }
    } catch {
      continue;
    }
  }

  return null;
}
