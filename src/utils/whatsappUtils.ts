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
}): string {
  const amt  = new Intl.NumberFormat('en-IN').format(p.amount);
  const days = p.daysOverdue;
  let msg = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is overdue by ${days} day${days !== 1 ? 's' : ''}.`;
  if (p.upiId) msg += `\n\nPlease pay via UPI: ${p.upiId}`;
  return msg;
}

export function dueMessage(p: {
  borrowerName: string;
  amount: number;
  monthYear: string;
  dueDate: string;
  upiId?: string;
}): string {
  const amt     = new Intl.NumberFormat('en-IN').format(p.amount);
  const dateStr = new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  let msg = `Hi ${p.borrowerName}, your interest of ₹${amt} for ${p.monthYear} is due on ${dateStr}.`;
  if (p.upiId) msg += `\n\nPlease pay via UPI: ${p.upiId}`;
  return msg;
}
