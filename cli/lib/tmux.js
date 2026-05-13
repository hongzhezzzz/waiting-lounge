"use strict";

// Shared tmux helpers used by `waiting-lounge dock`, `attach`, and
// the install command. Keeping this in one place so the same detection
// logic ships everywhere — we don't want one command to think tmux is
// installed while another thinks it isn't.

const { execFileSync, spawn } = require("node:child_process");

function hasTmux() {
  try {
    execFileSync("which", ["tmux"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasCmd(name) {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Returns the first matching package manager descriptor we can detect on
// this Linux/WSL host, or null. We never auto-run these — sudo always
// requires the user's consent — so this just shapes the printed hint.
function detectLinuxPackageManager() {
  const candidates = [
    { cmd: "apt", install: "sudo apt install tmux" },
    { cmd: "apt-get", install: "sudo apt-get install tmux" },
    { cmd: "dnf", install: "sudo dnf install tmux" },
    { cmd: "yum", install: "sudo yum install tmux" },
    { cmd: "pacman", install: "sudo pacman -S tmux" },
    { cmd: "zypper", install: "sudo zypper install tmux" },
    { cmd: "apk", install: "sudo apk add tmux" },
  ];
  for (const c of candidates) {
    if (hasCmd(c.cmd)) return c;
  }
  return null;
}

module.exports = { hasTmux, hasCmd, detectLinuxPackageManager };
