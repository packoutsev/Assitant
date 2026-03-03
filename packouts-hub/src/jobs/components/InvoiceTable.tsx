import type { QBOInvoice } from '../types';

function formatCurrency(amount?: number): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InvoiceTable({ invoices }: { invoices: QBOInvoice[] }) {
  if (invoices.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No invoices found for this customer.</p>;
  }

  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalBalance = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 font-semibold text-gray-600">Invoice #</th>
              <th className="text-left py-2 px-3 font-semibold text-gray-600">Date</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-600">Total</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-600">Balance</th>
              <th className="text-left py-2 px-3 font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const paid = (inv.balance || 0) === 0;
              return (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono">{inv.doc_number || inv.id}</td>
                  <td className="py-2 px-3">{formatDate(inv.txn_date)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatCurrency(inv.total)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatCurrency(inv.balance)}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {inv.status || (paid ? 'Paid' : 'Open')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end gap-8 mt-4 pt-3 border-t border-gray-200 text-sm">
        <div>
          <span className="text-gray-500">Total Billed:</span>{' '}
          <span className="font-semibold font-mono">{formatCurrency(totalBilled)}</span>
        </div>
        <div>
          <span className="text-gray-500">Outstanding:</span>{' '}
          <span className={`font-semibold font-mono ${totalBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {formatCurrency(totalBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}
