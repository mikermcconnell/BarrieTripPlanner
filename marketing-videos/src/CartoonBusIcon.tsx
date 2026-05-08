import React from "react";

type CartoonBusIconProps = {
  routeLabel?: string;
};

export const CartoonBusIcon = ({ routeLabel = "11" }: CartoonBusIconProps) => {
  return (
    <g>
      <ellipse cx="0" cy="33" rx="35" ry="12" fill="rgba(18,32,51,0.18)" />
      <path
        d="M-38 -24 Q-38 -42 -20 -46 L22 -46 Q38 -42 40 -24 L40 18 Q40 31 27 31 L-27 31 Q-40 31 -40 18 Z"
        fill="#10B981"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M-24 -35 L24 -35 Q31 -35 31 -27 L31 -11 Q31 -4 24 -4 L-24 -4 Q-31 -4 -31 -11 L-31 -27 Q-31 -35 -24 -35 Z"
        fill="#EAF3FF"
      />
      <path d="M-28 -3 L28 -3 L23 16 L-23 16 Z" fill="#079669" opacity="0.95" />
      <circle cx="-25" cy="30" r="9" fill="#122033" />
      <circle cx="25" cy="30" r="9" fill="#122033" />
      <circle cx="-25" cy="30" r="4" fill="#D7DEE8" />
      <circle cx="25" cy="30" r="4" fill="#D7DEE8" />
      <circle cx="-29" cy="6" r="5" fill="#FBBF24" />
      <circle cx="29" cy="6" r="5" fill="#FBBF24" />
      <rect x="-16" y="-1" width="32" height="24" rx="12" fill="#FFFFFF" />
      <text
        x="0"
        y="16"
        fill="#0B214A"
        fontSize="20"
        fontWeight="950"
        textAnchor="middle"
        style={{ letterSpacing: 0.2 }}
      >
        {routeLabel}
      </text>
      <path d="M-24 -41 Q0 -51 25 -41" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="4" strokeLinecap="round" />
    </g>
  );
};
