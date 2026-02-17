
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: string;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, title, subtitle, icon, className = '', noPadding = false }) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col ${className}`}>
      {title && (
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mr-4 border border-slate-100">
                <i className={`fa-solid ${icon} text-indigo-600 text-lg`}></i>
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};
