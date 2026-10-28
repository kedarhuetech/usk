import AddSale from "../Sales/AddSale";

// Renders the add purchase interface.
function AddPurchase({ localOnly = false }) {
  return <AddSale mode="purchase" localOnly={localOnly} />;
}

export default AddPurchase;
