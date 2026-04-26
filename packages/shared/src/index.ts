export const deploymentStatuses = [
  "pending",
  "cloning",
  "building",
  "deploying",
  "running",
  "failed",
] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];

export type Deployment = {
  id: string;
  name: string;
  repoUrl: string;
  status: DeploymentStatus;
  imageTag: string | null;
  containerId: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDeploymentInput = {
  repoUrl: string;
};
