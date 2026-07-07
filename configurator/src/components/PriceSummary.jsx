const money = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export default function PriceSummary({ estimate, manualDiscount, onManualDiscountChange, readOnlyDiscount }) {
  return (
    <div className="control-block price-summary">
      <div className="control-label">Estimate Summary</div>
      <table className="price-table">
        <tbody>
          {estimate.lineItems.map((li) => (
            <tr key={li.key}>
              <td>{li.label}</td>
              <td className="price-table-qty">{li.qty.toLocaleString()} {li.unit}</td>
              <td className="price-table-total">{money(li.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="price-row">
        <span>Subtotal</span>
        <span>{money(estimate.subtotal)}</span>
      </div>
      {estimate.deals.fullWrap && (
        <div className="price-row price-row-deal">
          <span>Full Wrap discount (7%)</span>
          <span>-{money(estimate.deals.fullWrapDiscountAmount)}</span>
        </div>
      )}

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
        <span>GST ({(estimate.gstRate * 100).toFixed(0)}%)</span>
        <span>{money(estimate.gst)}</span>
      </div>
      <div className="price-row price-row-total">
        <span>Total Estimate</span>
        <span>{money(estimate.total)}</span>
      </div>
      <div className="price-deals-note">
        {estimate.deals.soffitFasciaDeal && <div>✓ Soffit + Fascia package — 50% off fascia</div>}
        {estimate.deals.gutterDownspoutDeal && <div>✓ Gutters + Downspouts package — downspouts free</div>}
        {estimate.deals.fullWrap && <div>✓ Full Wrap package — 7% off total</div>}
      </div>
    </div>
  );
}
