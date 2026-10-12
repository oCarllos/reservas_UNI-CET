'use client';

import { useState } from 'react';
import { cancelEquipmentReservation } from '@/app/equipment-actions';

export default function CancelEquipmentReservationForm({ reservationId }: { reservationId: string }) {
  const [confirming, setConfirming] = useState(false);
  return <form action={cancelEquipmentReservation}><input type="hidden" name="id" value={reservationId} /><button type="button" className="btn btnlight" style={{ padding: '6px 9px' }} onClick={() => setConfirming(true)}>Cancelar</button>{confirming && <div className="confirm-overlay"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-equipment-title"><h2 id="cancel-equipment-title">Cancelar reserva de equipamento</h2><p>Tem certeza que deseja cancelar essa reserva?</p><div className="confirm-actions"><button type="button" className="btn btnlight" onClick={() => setConfirming(false)}>NÃO</button><button type="submit" className="btn">SIM</button></div></section></div>}</form>;
}
