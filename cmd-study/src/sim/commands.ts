import { installBuiltins } from './shell/builtins'
import { installLinuxCommands } from './linux/commands'
import { installDockerCommands } from './docker/commands'
import { installKubectlCommands } from './kubernetes/commands'

let initialized = false

export function initCommands(): void {
  if (initialized) return
  initialized = true
  installBuiltins()
  installLinuxCommands()
  installDockerCommands()
  installKubectlCommands()
}
