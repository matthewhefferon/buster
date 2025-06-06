import React from 'react';

import { iconProps } from './iconProps';

function penWriting(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '12px pen writing';

  return (
    <svg height="1em" width="1em" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <g fill="currentColor">
        <path
          d="m10.411,1.589h0c.759.759.759,1.991,0,2.75l-5.281,5.281c-.249.249-.559.428-.899.518l-3.231.862.862-3.231c.091-.34.269-.65.518-.899L7.661,1.589c.759-.759,1.991-.759,2.75,0Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokewidth}
        />
        <path
          d="M11.25 10.75L7.25 10.75"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokewidth}
        />
      </g>
    </svg>
  );
}

export default penWriting;
