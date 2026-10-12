'use client';

import { useState } from 'react';
import { cancelReservation } from '../../actions';

export default function CancelReservationForm({ reservationId }: { reservationId: string }) {
  const [confirming, setConfirming] = useState(false);
  return <form action={cancelReservation}>
    <input type="hidden" name="id" value={reservationId} />
    <button type="button" className="btn btnlight" style={{ padding: '6px 9px' }} onClick={() => setConfirming(true)}>Cancelar</button>
    {confirming && <div className="confirm-overlay">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Cancelar reserva</h2>
        <p>Tem certeza que deseja cancelar essa reserva?</p>
        <div className="confirm-actions">
          <button type="button" className="btn btnlight" onClick={() => setConfirming(false)}>NÃO</button>
          <button type="submit" className="btn">SIM</button>
        </div>
      </section>
    </div>}
  </form>;
}
