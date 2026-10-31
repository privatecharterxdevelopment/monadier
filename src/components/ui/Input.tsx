import React, { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="mb-4">
        {label && (
          <label className="block text-[#0a0a0a] mb-2 text-sm" htmlFor={props.id}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            input-field text-[#0a0a0a] caret-[#0a0a0a]
            ${error ? 'border-error focus:ring-error' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-error text-xs">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;