import React from 'react';

import { iconProps } from './iconProps';

function cubes2(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px cubes 2';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M8.74,2.801l-2.75-1.283c-.471-.22-1.01-.22-1.48,0L1.76,2.801c-.613,.287-1.01,.909-1.01,1.586v3.227c0,.677,.396,1.299,1.01,1.586l2.75,1.283c.235,.11,.487,.165,.74,.165s.505-.055,.74-.165l2.75-1.283c.613-.287,1.01-.909,1.01-1.586v-3.227c0-.677-.396-1.299-1.01-1.586ZM2.25,7.613v-2.685l2.25,1.05v2.844l-2.105-.982c-.088-.041-.145-.13-.145-.227Zm5.855,.227l-2.105,.982v-2.844l2.25-1.05v2.686c0,.097-.057,.186-.145,.227Z"
          fill="currentColor"
        />
        <path
          d="M16.24,2.801l-2.75-1.283c-.471-.22-1.01-.22-1.48,0l-2.75,1.283c-.613,.287-1.01,.909-1.01,1.586v3.227c0,.677,.396,1.299,1.01,1.586l2.75,1.283c.235,.11,.487,.165,.74,.165s.505-.055,.74-.165l2.75-1.283c.613-.287,1.01-.909,1.01-1.586v-3.227c0-.677-.396-1.299-1.01-1.586Zm-6.49,4.812v-2.686l2.25,1.05v2.844l-2.105-.982c-.088-.041-.145-.13-.145-.227Zm5.855,.227l-2.105,.982v-2.844l2.25-1.05v2.685c0,.097-.057,.186-.145,.227Z"
          fill="currentColor"
        />
        <path
          d="M12.49,9.051l-2.75-1.283c-.471-.22-1.01-.22-1.48,0l-2.75,1.283c-.613,.287-1.01,.909-1.01,1.586v3.227c0,.677,.396,1.299,1.01,1.586l2.75,1.283c.235,.11,.487,.165,.74,.165s.505-.055,.74-.165l2.75-1.283c.613-.287,1.01-.909,1.01-1.586v-3.227c0-.677-.396-1.299-1.01-1.586Zm-6.49,4.812v-2.685l2.25,1.05v2.844l-2.105-.982c-.088-.041-.145-.13-.145-.227Zm5.855,.227l-2.105,.982v-2.844l2.25-1.05v2.686c0,.097-.057,.186-.145,.227Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default cubes2;
