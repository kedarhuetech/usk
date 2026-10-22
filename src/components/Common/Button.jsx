function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
