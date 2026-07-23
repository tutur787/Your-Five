import { FormEvent, useEffect, useRef, useState } from "react";
import { FaChartColumn, FaGoogle, FaUser } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function AccountButton() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(auth.user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setDisplayName(auth.user?.displayName ?? ""), [auth.user?.displayName]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await auth.updateDisplayName(displayName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const removeAccount = async () => {
    if (!window.confirm("Delete your Your Five account and cloud record? This cannot be undone.")) return;
    setSaving(true);
    setError(null);
    try {
      await auth.deleteAccount();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete your account.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setSaving(true);
    setError(null);
    try {
      await auth.signOut();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign out.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className={`icon-button account-button${auth.user ? " signed-in" : ""}`} onClick={() => setOpen(true)} aria-label="Account" title="Account">
        {auth.user ? <span>{initials(auth.user.displayName)}</span> : <FaUser aria-hidden="true" />}
      </button>
      {open && (
        <div className="modal-backdrop account-modal-backdrop" onClick={() => setOpen(false)}>
          <section className="modal account-modal" role="dialog" aria-modal="true" aria-label="Your account" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="page-eyebrow">YOUR PROFILE</span><h2>{auth.user ? auth.user.displayName : "Your account"}</h2></div>
              <button ref={closeRef} className="icon-button modal-close" onClick={() => setOpen(false)} aria-label="Close" title="Close">&times;</button>
            </header>
            {auth.status === "loading" ? (
              <div className="account-loading"><span className="search-pulse" /> Checking account</div>
            ) : auth.user ? (
              <div className="account-content">
                <div className="account-identity">
                  <span className="account-avatar">{initials(auth.user.displayName)}</span>
                  <span><strong>{auth.user.displayName}</strong><small>{auth.user.email}</small></span>
                  <span className={`account-sync ${auth.syncStatus}`}>{auth.syncStatus === "syncing" ? "Syncing" : auth.syncStatus === "error" ? "Sync paused" : "Synced"}</span>
                </div>
                <form className="account-profile-form" onSubmit={save}>
                  <label htmlFor="account-display-name">Display name</label>
                  <div><input id="account-display-name" value={displayName} maxLength={24} onChange={(event) => setDisplayName(event.target.value)} /><button className="primary" disabled={saving || displayName.trim() === auth.user.displayName}>{saving ? "Saving" : "Save"}</button></div>
                </form>
                {error && <div className="account-error">{error}</div>}
                {auth.user.isAdmin && (
                  <button
                    className="account-admin-link"
                    onClick={() => {
                      setOpen(false);
                      navigate("/admin");
                    }}
                  >
                    <FaChartColumn aria-hidden="true" />
                    <span><strong>Owner dashboard</strong><small>Accounts and game activity</small></span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                )}
                <div className="account-actions">
                  <button className="secondary" disabled={saving} onClick={() => void signOut()}>Sign out</button>
                  <button className="text-button danger" disabled={saving} onClick={() => void removeAccount()}>Delete account</button>
                </div>
              </div>
            ) : (
              <div className="account-content account-guest">
                <p>Your record currently lives on this device.</p>
                {error && <div className="account-error">{error}</div>}
                <button className="google-sign-in" onClick={auth.signIn}><FaGoogle aria-hidden="true" /><span>Continue with Google</span></button>
                <small>Guest play stays available. Signing in imports this device's current record.</small>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
