import React, { ButtonHTMLAttributes } from 'react';
import { motion } from 'framer-motion';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  children,
  className = '',
  ...props
}) => {
  const variantClasses = {
    primary: 'bg-white text-background hover:bg-gray-100',
    secondary: 'border border-white/20 text-white hover:bg-white/10',
    ghost: 'text-white hover:bg-white/10'
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3',
    lg: 'px-8 py-4 text-lg'
  };

  const baseClasses = `
    font-medium rounded-full transition-all duration-300
    inline-flex items-center justify-center
    disabled:opacity-50 disabled:cursor-not-allowed
    relative overflow-hidden group
  `;

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <motion.button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${widthClass}
        ${className}
      `}
      disabled={isLoading || props.disabled}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.02 }}
      {...props}
    >
      <span className="relative z-10">
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
            <span>Loading...</span>
          </div>
        ) : (
          children
        )}
      </span>
      
      <div className="absolute inset-0 bg-white/10 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
    </motion.button>
  );
};

export default Button;