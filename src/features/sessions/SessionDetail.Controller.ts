import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { MarginaliaAnnotation, MarginaliaSessionDetail, SecondPassClient } from "@secondpass/client";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { CloseSessionInput } from "./CloseSessionDialog.UI";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export function useSessionDetail({ spl, sessionId }: { spl: SecondPassClient | null; sessionId: string }) {
  const canLoad = Boolean(spl);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MarginaliaSessionDetail | null>(null);
  const session = detail?.session ?? null;
  const book = detail?.context.book ?? null;

  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const [annoBusy, setAnnoBusy] = useState(false);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<MarginaliaAnnotation[] | null>(null);

  const load = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const response = await spl.marginalia.sessions.get(sessionId);
      const s = response.session;
      setDetail(response);
      setDraftName(typeof s.name === "string" ? s.name : "");
      setDraftNotes(typeof s.notes === "string" ? s.notes : "");
      setEditingName(false);
      setEditingNotes(false);
    } catch (e) {
      debugWarn("reader", "Reading Session detail could not be loaded", {
        sessionId,
        error: e,
      });
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "This connection cannot access the Reading Session. Open Settings to repair or review the connection."
          : e instanceof ApiError && e.status === 404
            ? "This Reading Session is unavailable. It may have been removed, or you may not have access."
            : "Couldn't load the Reading Session. Reload the page to try again.";
      setError(message);
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }, [sessionId, spl]);

  const loadAnnotations = useCallback(
    async () => {
      if (!spl) return;
      setAnnoBusy(true);
      setAnnoError(null);
      try {
        const response = await spl.marginalia.sessions.getAnnotations(sessionId);
        setAnnotations(response.annotations);
      } catch (e) {
        debugWarn("reader", "Reading Session annotations could not be loaded", {
          sessionId,
          error: e,
        });
        setAnnoError("Couldn't load annotations. Reload the page to try again.");
        setAnnotations(null);
      } finally {
        setAnnoBusy(false);
      }
    },
    [sessionId, spl],
  );

  useEffect(() => {
    setDetail(null);
    setError(null);
    setBusy(false);
    setSaveError(null);
    setCloseDialogOpen(false);
    setAnnotations(null);
    setAnnoError(null);
    setAnnoBusy(false);
    if (!canLoad) return;
    void load();
    void loadAnnotations();
  }, [canLoad, load, loadAnnotations]);

  const isActive = session?.status === "active";
  const handleSaveName = useCallback(async () => {
    if (!spl) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const refreshed = await spl.marginalia.sessions.update(sessionId, { name: draftName });
      setDetail(refreshed);
      setEditingName(false);
    } catch (e) {
      debugWarn("reader", "Reading Session name was not saved", {
        sessionId,
        error: e,
      });
      setSaveError("Couldn't save the Reading Session details. Try again.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftName, isActive, session, sessionId, spl]);

  const handleSaveNotes = useCallback(async () => {
    if (!spl) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const refreshed = await spl.marginalia.sessions.update(sessionId, { notes: draftNotes });
      setDetail(refreshed);
      setEditingNotes(false);
    } catch (e) {
      debugWarn("reader", "Reading Session notes were not saved", {
        sessionId,
        error: e,
      });
      setSaveError("Couldn't save the Reading Session details. Try again.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftNotes, isActive, session, sessionId, spl]);

  const handleSaveAndClose = useCallback(async (input: CloseSessionInput) => {
    if (!spl) return;
    if (!sessionId) return;
    if (!session) return;

    try {
      const savedName = typeof session.name === "string" ? session.name.trim() : "";
      const savedNotes = typeof session.notes === "string" ? session.notes : "";
      const payload: { name?: string; notes?: string } = {};
      if (input.name !== savedName) payload.name = input.name;
      if (input.notes !== savedNotes) payload.notes = input.notes;
      if (Object.keys(payload).length > 0) {
        await spl.marginalia.sessions.update(sessionId, payload);
      }
      const refreshed = await spl.marginalia.sessions.close(sessionId);
      setDetail(refreshed);
      setDraftName(refreshed.session.name);
      setDraftNotes(refreshed.session.notes);
      setEditingName(false);
      setEditingNotes(false);
      setCloseDialogOpen(false);
      if (input.afterAction === "sessions") navigateTo({ kind: "sessions" });
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to close session.");
    }
  }, [session, sessionId, spl]);

  const beginNameEdit = useCallback(() => {
    setDraftName(typeof session?.name === "string" ? session.name : "");
    setSaveError(null);
    setEditingName(true);
  }, [session]);
  const cancelNameEdit = useCallback(() => {
    setEditingName(false);
    setDraftName(typeof session?.name === "string" ? session.name : "");
    setSaveError(null);
  }, [session]);
  const beginNotesEdit = useCallback(() => {
    setDraftNotes(typeof session?.notes === "string" ? session.notes : "");
    setEditingNotes(true);
  }, [session]);
  const cancelNotesEdit = useCallback(() => {
    setEditingNotes(false);
    setDraftNotes(typeof session?.notes === "string" ? session.notes : "");
    setSaveError(null);
  }, [session]);
  const openCloseDialog = useCallback(() => setCloseDialogOpen(true), []);
  const dismissCloseDialog = useCallback(() => setCloseDialogOpen(false), []);

  return {
    canLoad, busy, error, session, book, isActive,
    nameEditor: {
      draftName, editingName, saveBusy, saveError,
      onChangeName: setDraftName, onBeginNameEdit: beginNameEdit,
      onCancelNameEdit: cancelNameEdit, onSaveName: handleSaveName,
    },
    notesEditor: {
      draftNotes, editingNotes, saveBusy, saveError,
      onChangeNotes: setDraftNotes, onBeginNotesEdit: beginNotesEdit,
      onCancelNotesEdit: cancelNotesEdit, onSaveNotes: handleSaveNotes,
    },
    annotations, annoBusy, annoError,
    closeDialogOpen, openCloseDialog, dismissCloseDialog,
    saveAndClose: handleSaveAndClose,
  };
}
