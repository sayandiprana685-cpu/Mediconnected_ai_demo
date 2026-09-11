import "./prescription-document.css";

function fmtFollowUp(d) {
  if (!d) return "____ / ____ / ______";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "____ / ____ / ______";
  return x.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PrescriptionDocument({ doc }) {
  if (!doc) return null;
  const lh = doc.letterhead || {};
  const dr = doc.doctor || {};
  const p = doc.patient || {};
  const v = doc.vitals || {};
  const meds = (doc.medicines || []).filter((m) => m.name);
  const tests = (doc.investigations || []).filter((t) => t.name);
  const advice = doc.adviceItems || [];
  const addr = [lh.address, [lh.city, lh.state, lh.pin].filter(Boolean).join(", ")].filter(Boolean).join(", ");

  return (
    <article className="rx-doc" aria-label="Prescription document">
      <header className="rx-header">
        <h1 className="rx-facility">{(lh.facilityName || "Healthcare facility").toUpperCase()}</h1>
        {lh.department ? <p className="rx-dept">{lh.department}</p> : null}
        <p className="rx-contact">{addr}</p>
        <p className="rx-contact">
          {[lh.phone && `Phone: ${lh.phone}`, lh.email && `Email: ${lh.email}`, lh.website && `Website: ${lh.website}`]
            .filter(Boolean)
            .join("  |  ")}
        </p>
        <hr className="rx-rule" />
        <p className="rx-docname">{(dr.name || "Doctor").toUpperCase()}</p>
        <p className="rx-cred">
          {[dr.qualification, dr.specialization && `Specialization: ${dr.specialization}`, dr.registrationNumber && `Reg. No. ${dr.registrationNumber}`]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>

      <section className="rx-block">
        <h2>Patient details</h2>
        <div className="rx-grid">
          <span>
            <strong>Name</strong> {p.name || "—"}
          </span>
          <span>
            <strong>Patient ID</strong> {p.mrn || "—"}
          </span>
          <span>
            <strong>Age</strong> {p.age || "—"}
          </span>
          <span>
            <strong>Sex</strong> {p.sex || "—"}
          </span>
          <span>
            <strong>Date</strong> {p.date || "—"}
          </span>
        </div>
        <p>
          <strong>Address</strong> {p.address || "—"}
        </p>
        <p>
          <strong>Vitals</strong> BP {v.bp || "—"} &nbsp; Temp {v.temperature || "—"} &nbsp; Pulse {v.pulse || "—"} &nbsp; Weight {v.weight || "—"}
        </p>
      </section>

      <section className="rx-block">
        <h2>Diagnosis / clinical notes</h2>
        {doc.chiefComplaint ? (
          <p>
            <strong>Primary complaint / symptoms.</strong> {doc.chiefComplaint}
          </p>
        ) : null}
        {doc.diagnosis ? (
          <p>
            <strong>Diagnosis.</strong> {doc.diagnosis}
          </p>
        ) : null}
        {doc.clinicalNotes ? (
          <p>
            <strong>Clinical notes.</strong> {doc.clinicalNotes}
          </p>
        ) : null}
        {!doc.chiefComplaint && !doc.diagnosis && !doc.clinicalNotes ? <p className="rx-muted">Not recorded.</p> : null}
      </section>

      <section className="rx-block rx-meds">
        <h2>
          <span className="rx-symbol">℞</span> Medicines
        </h2>
        {meds.length ? (
          <ol>
            {meds.map((m, i) => (
              <li key={i} className="rx-med">
                <p className="rx-med-name">
                  {m.name}
                  {m.strength ? `  ${m.strength}` : ""}
                </p>
                <p className="rx-med-meta">
                  {[m.dosage && `Dosage: ${m.dosage}`, m.frequency && `Schedule: ${m.frequency}`, m.duration && `Duration: ${m.duration}`]
                    .filter(Boolean)
                    .join("    ")}
                </p>
                {m.instructions ? <p className="rx-med-note">{m.instructions}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rx-muted">No medicines recorded.</p>
        )}
      </section>

      {tests.length ? (
        <section className="rx-block">
          <h2>Investigations / tests advised</h2>
          <ul className="rx-checks">
            {tests.map((t, i) => (
              <li key={i}>
                <span className="rx-box">{t.advised !== false ? "✓" : ""}</span>
                {t.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {advice.length ? (
        <section className="rx-block">
          <h2>General advice / lifestyle instructions</h2>
          <ul>
            {advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="rx-footer">
        <div className="rx-foot-row">
          <p>
            <strong>Substitution permitted:</strong>{" "}
            <span className="rx-box">{doc.substitutionAllowed === true ? "✓" : ""}</span> YES{" "}
            <span className="rx-box">{doc.substitutionAllowed === false ? "✓" : ""}</span> NO
          </p>
          <p>
            <strong>Follow-up date:</strong> {fmtFollowUp(doc.followUpDate)}
          </p>
        </div>
        <div className="rx-sign">
          {dr.signatureUrl ? <img src={dr.signatureUrl} alt="" className="rx-sign-img" /> : <span className="rx-sign-line" />}
          <p>Doctor&apos;s signature &amp; stamp</p>
        </div>
        <p className="rx-valid">* Valid for 30 days from the date of issue *</p>
      </footer>
    </article>
  );
}
