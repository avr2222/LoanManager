import { describe, it, expect } from 'vitest';
import { overdueMessage, dueMessage, mediatorOverdueMessage, mediatorDueMessage } from '../whatsappUtils';

describe('overdueMessage', () => {
  it('includes borrower name, amount, monthYear, days', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 5 });
    expect(msg).toContain('Vamsi');
    expect(msg).toContain('₹1,000');
    expect(msg).toContain('May-2026');
    expect(msg).toContain('5 days');
  });

  it('includes Telugu translation', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 1 });
    expect(msg).toContain('హాయ్ Vamsi');
    expect(msg).toContain('1 రోజులు');
  });

  it('appends UPI deep link when upiId provided', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 3, upiId: 'test@upi' });
    expect(msg).toContain('upi://pay?pa=test%40upi');
    expect(msg).toContain('UPI ద్వారా చెల్లించండి');
  });

  it('omits UPI section when upiId not provided', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 3 });
    expect(msg).not.toContain('upi://');
  });

  it('appends lender name as sign-off when provided', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 3, lenderName: 'Adapala' });
    expect(msg).toContain('- Adapala');
  });

  it('omits sign-off when lenderName not provided', () => {
    const msg = overdueMessage({ borrowerName: 'Vamsi', amount: 1000, monthYear: 'May-2026', daysOverdue: 3 });
    expect(msg).not.toMatch(/\n- /);
  });
});

describe('dueMessage', () => {
  it('includes borrower name, amount and monthYear', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15' });
    expect(msg).toContain('Sailaja');
    expect(msg).toContain('₹2,000');
    expect(msg).toContain('Jun-2026');
  });

  it('includes Telugu translation', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15' });
    expect(msg).toContain('హాయ్ Sailaja');
    expect(msg).toContain('చెల్లించాలి');
  });

  it('appends UPI link when upiId provided', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15', upiId: 'lender@upi' });
    expect(msg).toContain('upi://pay?pa=lender%40upi');
  });

  it('omits UPI section when upiId not provided', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15' });
    expect(msg).not.toContain('upi://');
  });

  it('appends lender name sign-off', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15', lenderName: 'Ravi' });
    expect(msg).toContain('- Ravi');
  });

  it('omits sign-off when lenderName not provided', () => {
    const msg = dueMessage({ borrowerName: 'Sailaja', amount: 2000, monthYear: 'Jun-2026', dueDate: '2026-06-15' });
    expect(msg).not.toMatch(/\n- /);
  });
});

describe('mediatorOverdueMessage', () => {
  it('includes mediator name, borrower name, amount, days', () => {
    const msg = mediatorOverdueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 1000, monthYear: 'May-2026', daysOverdue: 4 });
    expect(msg).toContain('Raju');
    expect(msg).toContain('Vamsi');
    expect(msg).toContain('₹1,000');
    expect(msg).toContain('4 days');
  });

  it('does not contain share/commission amount', () => {
    const msg = mediatorOverdueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 1000, monthYear: 'May-2026', daysOverdue: 4 });
    expect(msg).not.toContain('share');
    expect(msg).not.toContain('commission');
  });

  it('includes Telugu translation', () => {
    const msg = mediatorOverdueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 1000, monthYear: 'May-2026', daysOverdue: 4 });
    expect(msg).toContain('హాయ్ Raju');
  });

  it('uses plural "days" for multiple days', () => {
    const msg = mediatorOverdueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 1000, monthYear: 'May-2026', daysOverdue: 2 });
    expect(msg).toContain('2 days');
  });
});

describe('mediatorDueMessage', () => {
  it('includes mediator name, borrower name, amount', () => {
    const msg = mediatorDueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 3000, monthYear: 'Jun-2026', dueDate: '2026-06-20' });
    expect(msg).toContain('Raju');
    expect(msg).toContain('Vamsi');
    expect(msg).toContain('₹3,000');
  });

  it('does not contain share/commission amount', () => {
    const msg = mediatorDueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 3000, monthYear: 'Jun-2026', dueDate: '2026-06-20' });
    expect(msg).not.toContain('share');
    expect(msg).not.toContain('commission');
  });

  it('includes Telugu translation', () => {
    const msg = mediatorDueMessage({ mediatorName: 'Raju', borrowerName: 'Vamsi', totalAmount: 3000, monthYear: 'Jun-2026', dueDate: '2026-06-20' });
    expect(msg).toContain('హాయ్ Raju');
    expect(msg).toContain('వసూలు చేయండి');
  });
});
