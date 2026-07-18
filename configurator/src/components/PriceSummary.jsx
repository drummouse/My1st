import { displayMeasurement } from '../lib/units.js';

const money = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
// Trims to at most 2 decimals but drops trailing zeros (5% not 5.00%, 14.975% stays precise).
const formatPct = (rate) => (rate * 100).toFixed(2).replace(/\.?0+$/, '');

export default function PriceSummary({ estimate, manualDiscount, onManualDiscountChange, readOnlyDiscount, unitSystem = 'imperial' }) {
  return (
    <div className="control-block price-summary">
      <div className="control-label">Estimate Summary</div>
      <table className="price-table">
        <tbody>
          {estimate.lineItems.map((li) => {
            const displayQuantity = displayMeasurement(li.qty, li.unit, unitSystem);
            return (
              <tr key={li.key}>
                <td>
                  {li.label}
                  {li.description && <div className="service-note">{li.description}</div>}
                  {li.linkUrl && <div><a href={li.linkUrl} target="_blank" rel="noreferrer">Link</a></div>}
                </td>
                <td className="price-table-qty">
                  {displayQuantity.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {displayQuantity.unit}
                </td>
                <td className="price-table-total">{money(li.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="price-row">
        <span>Subtotal</span>
        <span>{money(estimate.subtotal)}</span>
      </div>
      {estimate.appliedDiscounts.filter((d) => d.scope === 'subtotal').map((d) => (
        <div className="price-row price-row-deal" key={d.id}>
          <span>{d.name} ({Math.round(d.pct * 100)}%)</span>
          <span>-{money(d.amount)}</span>
        </div>
      ))}

      {readOnlyDiscount ? (
        manualDiscount > 0 && (
          <div className="price-row price-row-deal">
            <span>Additional discount</span>
            <span>-{money(manualDiscount)}</span>
          </div>
        )
      ) : (
        <div className="price-row price-row-discount">
          <label htmlFor="manual-discount">Additional discount</label>
          <span className="price-discount-input">
            $<input
              id="manual-discount"
              type="number"
              min="0"
              step="1"
              value={manualDiscount}
              onChange={(e) => onManualDiscountChange(Number(e.target.value) || 0)}
            />
          </span>
        </div>
      )}

      <div className="price-row">
        <span>Pre-tax total</span>
        <span>{money(estimate.preTaxTotal)}</span>
      </div>
      <div className="price-row">
        <span>{estimate.taxLabel} ({formatPct(estimate.taxRate)}%)</span>
        <span>{money(estimate.taxAmount)}</span>
      </div>
      <div className="price-row price-row-total">
        <span>Total Estimate</span>
        <span>{money(estimate.total)}</span>
      </div>
      {estimate.appliedDiscounts.length > 0 && (
        <div className="price-deals-note">
          {estimate.appliedDiscounts.map((d) => <div key={d.id}>{d.summary}</div>)}
        </div>
      )}
    </div>
  );
}
