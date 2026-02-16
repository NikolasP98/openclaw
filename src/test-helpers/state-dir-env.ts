type StateDirEnvSnapshot = {
  minionStateDir: string | undefined;
  minionbotStateDir: string | undefined;
};

export function snapshotStateDirEnv(): StateDirEnvSnapshot {
  return {
    minionStateDir: process.env.MINION_STATE_DIR,
    minionbotStateDir: process.env.MINIONBOT_STATE_DIR,
  };
}

export function restoreStateDirEnv(snapshot: StateDirEnvSnapshot): void {
  if (snapshot.minionStateDir === undefined) {
    delete process.env.MINION_STATE_DIR;
  } else {
    process.env.MINION_STATE_DIR = snapshot.minionStateDir;
  }
  if (snapshot.minionbotStateDir === undefined) {
    delete process.env.MINIONBOT_STATE_DIR;
  } else {
    process.env.MINIONBOT_STATE_DIR = snapshot.minionbotStateDir;
  }
}

export function setStateDirEnv(stateDir: string): void {
  process.env.MINION_STATE_DIR = stateDir;
  delete process.env.MINIONBOT_STATE_DIR;
}
