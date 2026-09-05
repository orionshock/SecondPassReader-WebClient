#!/bin/sh
set -eu

output_file="/usr/share/nginx/html/secondpass-servers.json"
temporary_file="${output_file}.tmp"

json_presets="${SECONDPASS_SERVER_PRESETS_JSON:-}"
if [ -n "$json_presets" ] && printf '%s' "$json_presets" | jq -e '
  type == "array" and
  all(.[]; type == "object" and (.name | type == "string" and length > 0) and (.url | type == "string" and length > 0))
' >/dev/null 2>&1; then
  printf '%s' "$json_presets" | jq -c '[.[] | {name: .name, url: .url}]' > "$temporary_file"
else
  printf '[]' > "$temporary_file"
  env | sed -n 's/^SECONDPASS_SERVER_\([0-9][0-9]*\)_NAME=.*/\1/p' | sort -n -u | while IFS= read -r index; do
    name="$(printenv "SECONDPASS_SERVER_${index}_NAME" || true)"
    url="$(printenv "SECONDPASS_SERVER_${index}_URL" || true)"
    if [ -n "$name" ] && [ -n "$url" ]; then
      jq -c --arg name "$name" --arg url "$url" '. + [{name: $name, url: $url}]' "$temporary_file" > "${temporary_file}.next"
      mv "${temporary_file}.next" "$temporary_file"
    fi
  done
fi

mv "$temporary_file" "$output_file"
