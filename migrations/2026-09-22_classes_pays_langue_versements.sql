-- Migrations du 22 septembre 2026.
-- Idempotent : ce fichier peut etre relance sans dommage.

-- 1. Colonnes ajoutees a users
ALTER TABLE users ADD COLUMN IF NOT EXISTS classes        json;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pays_code      varchar(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mode_versement varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS langue         varchar(5);

-- 2. Registre de ce qui est du aux professeurs payes par virement
CREATE TABLE IF NOT EXISTS versements_dus (
    id               serial      PRIMARY KEY,
    prof_id          integer     NOT NULL REFERENCES users(id),
    visio_session_id integer     REFERENCES visio_sessions(id),
    montant_cents    integer     NOT NULL,
    devise           varchar(3)  NOT NULL DEFAULT 'EUR',
    statut           varchar(10) NOT NULL DEFAULT 'du',
    reference        text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    verse_le         timestamptz,
    CONSTRAINT versements_statut_valide CHECK (statut IN ('du', 'verse')),
    CONSTRAINT versements_session_unique UNIQUE (visio_session_id)
);

CREATE INDEX IF NOT EXISTS idx_versements_prof_statut
    ON versements_dus (prof_id, statut);
