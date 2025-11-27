#!/bin/sh
if [ -z "$husky_skip_init" ]; then
  debug() {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename "$0")"
  debug "running $hook_name"
  if ! command -v husky &> /dev/null; then
    echo "husky is not installed"
    exit 1
  fi
  . "$(husky dir)/$hook_name"
fi
