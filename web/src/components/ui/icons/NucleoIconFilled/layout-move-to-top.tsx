import React from 'react';

import { iconProps } from './iconProps';

function layoutMoveToTop(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px layout move to top';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M14.25,2H3.75c-1.517,0-2.75,1.233-2.75,2.75V13.25c0,1.517,1.233,2.75,2.75,2.75H14.25c1.517,0,2.75-1.233,2.75-2.75V4.75c0-1.517-1.233-2.75-2.75-2.75Zm-2.599,9.151c-.146,.146-.338,.22-.53,.22s-.384-.073-.53-.22l-.841-.841v2.189c0,.414-.336,.75-.75,.75s-.75-.336-.75-.75v-2.189l-.841,.841c-.293,.293-.768,.293-1.061,0s-.293-.768,0-1.061l2.121-2.121c.293-.293,.768-.293,1.061,0l2.121,2.121c.293,.293,.293,.768,0,1.061Zm1.599-4.651H4.75c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75H13.25c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default layoutMoveToTop;
