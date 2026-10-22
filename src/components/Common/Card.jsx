function Card({ children, className = "", ...props }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`} {...props}>
      {children}
    </section>
  );
}

export default Card;
