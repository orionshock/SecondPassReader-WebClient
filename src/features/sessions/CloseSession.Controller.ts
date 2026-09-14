import { useCallback, useState } from "react";
import type { CloseSessionAfterAction, CloseSessionAfterOption, CloseSessionInput } from "./CloseSessionDialog.UI";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export function useCloseSession({ initialName, initialNotes, afterOptions, defaultAfterAction, onSaveAndClose }: {
  initialName: string;
  initialNotes: string;
  afterOptions: CloseSessionAfterOption[];
  defaultAfterAction?: CloseSessionAfterAction;
  onSaveAndClose: (input: CloseSessionInput) => Promise<void>;
}) {
  const initialAfterAction =
    defaultAfterAction && afterOptions.some((option) => option.action === defaultAfterAction)
      ? defaultAfterAction
      : afterOptions[0]?.action ?? "detail";
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [afterAction, setAfterAction] = useState<CloseSessionAfterAction>(initialAfterAction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await onSaveAndClose({ name: name.trim(), notes, afterAction });
    } catch (e) {
      debugWarn("reader", "Reading Session close did not complete", { error: e });
      setError("Couldn't close the Reading Session. Try again.");
      setBusy(false);
    }
  }, [afterAction, name, notes, onSaveAndClose]);

  return {
    name, notes, afterAction, busy, error,
    changeName: setName, changeNotes: setNotes, chooseAfterAction: setAfterAction, submit,
  };
}
