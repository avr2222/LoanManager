export function openWhatsApp(phone: string, message: string): void {
  const cleaned = phone.replace(/\D/g, '').slice(-10);
  if (cleaned.length < 10) return;
  window.open(
    `https://wa.me/91${cleaned}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener,noreferrer'
  );
}

export function overdueMessage(p: {
  borrowerName: string;
  amount: number;
  monthYear: string;
  daysOverdue: number;
  upiId?: string;
  lenderName?: string;
}): string {
  const amt  = new Intl.NumberFormat('en-IN').format(p.amount);
  const days = p.daysOverdue;
  const en = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is overdue by ${days} day${days !== 1 ? 's' : ''}.`;
  const te = `హాయ్ ${p.borrowerName}, మీ ${p.monthYear} వడ్డీ ₹${amt} ${days} రోజులు ఆలస్యం అయింది.`;
  let msg = `${en}\n\n${te}`;
  if (p.upiId) {
    const ref  = encodeURIComponent(`${p.monthYear} interest`);
    const name = encodeURIComponent(p.lenderName || 'Loan');
    const link = `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${name}&am=${p.amount}&cu=INR&tn=${ref}`;
    msg += `\n\nPay via UPI:\n${link}\n\nUPI ద్వారా చెల్లించండి:\n${link}`;
  }
  if (p.lenderName) msg += `\n\n- ${p.lenderName}`;
  return msg;
}

export function dueMessage(p: {
  borrowerName: string;
  amount: number;
  monthYear: string;
  dueDate: string;
  upiId?: string;
  lenderName?: string;
}): string {
  const amt     = new Intl.NumberFormat('en-IN').format(p.amount);
  const dateStr = new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const en = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is due on ${dateStr}.`;
  const te = `హాయ్ ${p.borrowerName}, మీ ${p.monthYear} వడ్డీ ₹${amt} ${dateStr} న చెల్లించాలి.`;
  let msg = `${en}\n\n${te}`;
  if (p.upiId) {
    const ref  = encodeURIComponent(`${p.monthYear} interest`);
    const name = encodeURIComponent(p.lenderName || 'Loan');
    const link = `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${name}&am=${p.amount}&cu=INR&tn=${ref}`;
    msg += `\n\nPay via UPI:\n${link}\n\nUPI ద్వారా చెల్లించండి:\n${link}`;
  }
  if (p.lenderName) msg += `\n\n- ${p.lenderName}`;
  return msg;
}

export function mediatorOverdueMessage(p: {
  mediatorName: string;
  borrowerName: string;
  totalAmount: number;
  monthYear: string;
  daysOverdue: number;
}): string {
  const total = new Intl.NumberFormat('en-IN').format(p.totalAmount);
  const days  = p.daysOverdue;
  const en = `Hi ${p.mediatorName}, ${p.borrowerName}'s interest of ₹${total} for ${p.monthYear} is overdue by ${days} day${days !== 1 ? 's' : ''}. Please follow up.`;
  const te = `హాయ్ ${p.mediatorName}, ${p.borrowerName} యొక్క ${p.monthYear} వడ్డీ ₹${total} ${days} రోజులు ఆలస్యం అయింది. దయచేసి ఫాలో అప్ చేయండి.`;
  return `${en}\n\n${te}`;
}

export function mediatorDueMessage(p: {
  mediatorName: string;
  borrowerName: string;
  totalAmount: number;
  monthYear: string;
  dueDate: string;
}): string {
  const total   = new Intl.NumberFormat('en-IN').format(p.totalAmount);
  const dateStr = new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const en = `Hi ${p.mediatorName}, please collect ${p.borrowerName}'s interest of ₹${total} for ${p.monthYear} due on ${dateStr}.`;
  const te = `హాయ్ ${p.mediatorName}, ${p.borrowerName} యొక్క ${p.monthYear} వడ్డీ ₹${total} ${dateStr} న వసూలు చేయండి.`;
  return `${en}\n\n${te}`;
}
