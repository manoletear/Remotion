-- Salvaged enrichment from the legacy Condogate model (P0).
--
-- The legacy app modeled extra visit context and lightweight user profiles that
-- the current schema dropped. Reintroduced here in our idiom (Spanish columns,
-- existing FKs) — NOT a port of the old tables, just the fields worth keeping:
--   * Invitation.guestReason  -> invitaciones.motivo
--   * Invitation.carPlate     -> invitaciones.patente
--   * Invitation.createdBy    -> invitaciones.creado_por  (FK residentes)
--   * User.familyName         -> residentes.apellido
--   * User.avatarUrl          -> residentes.avatar_url
--   * ActionStatus.SECURITY_RISK -> event_type 'RTU_SECURITY_RISK'
--
-- Everything else from Condogate (InvitationStatus, ActionType/ActionStatus,
-- AccessAction, AuditLog, User.role) is already covered by the current model
-- (state machine + jobs + sync fields + RtuOperation + eventos + perfiles.rol).

-- Invitation: visit context.
alter table invitaciones
  add column motivo      text,
  add column patente     text,
  add column creado_por  uuid references residentes (id) on delete set null;

-- Resident: profile fields (the legacy User.familyName / User.avatarUrl).
alter table residentes
  add column apellido    text,
  add column avatar_url  text;

-- Lets the reconciler flag an authorized number on the device that no active
-- invitation/resident explains (legacy ActionStatus.SECURITY_RISK), instead of
-- silently removing it. Audited, not auto-resolved.
alter type event_type add value if not exists 'RTU_SECURITY_RISK';
