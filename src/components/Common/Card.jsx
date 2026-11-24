// Renders the card interface.
function Card({ children, className = "", ...props }) {
  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-[#EAE2D6] bg-white text-[#242C1D] shadow-xs ${className}`} {...props}>
      {children}
    </section>
  );
}

export default Card;
