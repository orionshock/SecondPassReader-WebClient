#!/bin/sh
set -eu

output_file="/usr/share/nginx/html/secondpass-servers.json"
# Build beside the served file, then replace it atomically so nginx never exposes partial JSON.
temporary_file="${output_file}.tmp"

json_presets="${SECONDPASS_SERVER_PRESETS_JSON:-}"
if [ -n "$json_presets" ] && printf '%s' "$json_presets" | jq -e '
  type == "array" and
  all(.[]; type == "string" and (gsub("^\\s+|\\s+$"; "") | length > 0))
' >/dev/null 2>&1; then
  printf '%s' "$json_presets" | jq -c '[.[] | gsub("^\\s+|\\s+$"; "")]' > "$temporary_file"
else
  printf '[]' > "$temporary_file"
  env | sed -n 's/^SECONDPASS_SERVER_\([0-9][0-9]*\)_URL=.*/\1/p' | sort -n -u | while IFS= read -r index; do
    url="$(printenv "SECONDPASS_SERVER_${index}_URL" || true)"
    url="$(printf '%s' "$url" | jq -Rr 'gsub("^\\s+|\\s+$"; "")')"
    if [ -n "$url" ]; then
      jq -c --arg url "$url" '. + [$url]' "$temporary_file" > "${temporary_file}.next"
      mv "${temporary_file}.next" "$temporary_file"
    fi
  done
fi

mv "$temporary_file" "$output_file"
