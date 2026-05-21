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
  let msg = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is overdue by ${days} day${days !== 1 ? 's' : ''}.`;
  if (p.upiId) {
    const ref  = encodeURIComponent(`${p.monthYear} interest`);
    const name = encodeURIComponent(p.lenderName || 'Loan');
    const link = `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${name}&am=${p.amount}&cu=INR&tn=${ref}`;
    msg += `\n\nPay via UPI:\n${link}`;
  }
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
  let msg = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is due on ${dateStr}.`;
  if (p.upiId) {
    const ref  = encodeURIComponent(`${p.monthYear} interest`);
    const name = encodeURIComponent(p.lenderName || 'Loan');
    const link = `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${name}&am=${p.amount}&cu=INR&tn=${ref}`;
    msg += `\n\nPay via UPI:\n${link}`;
  }
  return msg;
}

export function mediatorOverdueMessage(p: {
  mediatorName: string;
  borrowerName: string;
  totalAmount: number;
  mediatorShare: number;
  monthYear: string;
  daysOverdue: number;
}): string {
  const total = new Intl.NumberFormat('en-IN').format(p.totalAmount);
  const share = new Intl.NumberFormat('en-IN').format(p.mediatorShare);
  const days  = p.daysOverdue;
  return `Hi ${p.mediatorName}, ${p.borrowerName}'s interest of ₹${total} for ${p.monthYear} is overdue by ${days} day${days !== 1 ? 's' : ''}. Please follow up. Your share: ₹${share}.`;
}

export function mediatorDueMessage(p: {
  mediatorName: string;
  borrowerName: string;
  totalAmount: number;
  mediatorShare: number;
  monthYear: string;
  dueDate: string;
}): string {
  const total   = new Intl.NumberFormat('en-IN').format(p.totalAmount);
  const share   = new Intl.NumberFormat('en-IN').format(p.mediatorShare);
  const dateStr = new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `Hi ${p.mediatorName}, please collect ${p.borrowerName}'s interest of ₹${total} for ${p.monthYear} due on ${dateStr}. Your share: ₹${share}.`;
}
