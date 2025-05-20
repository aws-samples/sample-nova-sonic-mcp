import { spawn } from "child_process";

import fs from "fs";
import os from "os";
import path from "path";

export function runInstallScript(scriptPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sanitizedBinaryName = scriptPath.replace(/\.\.\//g, '').replace(/\\/g, '');

    const installScriptPath = path.join(
      getResourcePath(),
      "scripts",
      sanitizedBinaryName
    );

    const nodeProcess = spawn(process.execPath, [installScriptPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });

    nodeProcess.stdout.on("data", (data) => {
      console.info(`Script output: ${data}`);
    });

    nodeProcess.stderr.on("data", (data) => {
      console.error(`Script error: ${data}`);
    });

    nodeProcess.on("close", (code) => {
      if (code === 0) {
        console.info("Script completed successfully");
        resolve();
      } else {
        console.error(`Script exited with code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

export async function getBinaryName(name: string): Promise<string> {
  if (process.platform === "win32") {
    return `${name}.exe`;
  }
  return name;
}

export async function getBinaryPath(name?: string): Promise<string> {
  if (!name) {
    return path.join(os.homedir(), ".cherrystudio", "bin");
  }

  const binaryName = await getBinaryName(name);
  const binariesDir = path.join(os.homedir(), ".cherrystudio", "bin");
  const binariesDirExists = await fs.existsSync(binariesDir);
  //return binariesDirExists ? path.join(binariesDir, binaryName) : binaryName;
  // Sanitize the input to prevent path traversal
  const sanitizedBinaryName = binaryName.replace(/\.\.\//g, '').replace(/\\/g, '');
  return binariesDirExists ? path.join(binariesDir, sanitizedBinaryName) : sanitizedBinaryName;

}

export async function isBinaryExists(name: string): Promise<boolean> {
  const cmd = await getBinaryPath(name);
  return await fs.existsSync(cmd);
}
function getResourcePath(): string {
  const appPath = process.env.APP_PATH || process.cwd();
  return path.join(appPath, "resources");
}
