import React from 'react';

import { iconProps } from './iconProps';

function sunCloudSnow(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px sun cloud snow';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M14.241,7.75c-.021,0-.042,0-.063-.002-.413-.034-.72-.396-.686-.81,.005-.062,.008-.125,.008-.188,0-1.241-1.009-2.25-2.25-2.25s-2.25,1.009-2.25,2.25c0,.412-.331,.783-.742,.787h-.008c-.408,0-.741-.29-.749-.698,0-.005,0-.084,0-.089,0-2.068,1.682-3.75,3.75-3.75s3.75,1.682,3.75,3.75c0,.105-.004,.209-.013,.312-.033,.392-.36,.688-.747,.688Z"
          fill="currentColor"
        />
        <path
          d="M11.25,2c-.414,0-.75-.336-.75-.75V.75c0-.414,.336-.75,.75-.75s.75,.336,.75,.75v.5c0,.414-.336,.75-.75,.75Z"
          fill="currentColor"
        />
        <path
          d="M15.139,3.611c-.192,0-.384-.073-.53-.22-.293-.293-.293-.768,0-1.061l.354-.354c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061l-.354,.354c-.146,.146-.338,.22-.53,.22Z"
          fill="currentColor"
        />
        <path
          d="M7.361,3.611c-.192,0-.384-.073-.53-.22l-.354-.354c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0l.354,.354c.293,.293,.293,.768,0,1.061-.146,.146-.338,.22-.53,.22Z"
          fill="currentColor"
        />
        <path
          d="M17.25,7.5h-.5c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75h.5c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
          fill="currentColor"
        />
        <path
          d="M13.75,8.5c-.234,0-.467,.026-.696,.079-.732-1.551-2.302-2.579-4.054-2.579s-3.322,1.028-4.054,2.579c-.229-.053-.461-.079-.696-.079-1.792,0-3.25,1.458-3.25,3.25s1.458,3.25,3.25,3.25h.343c.042-.083,.069-.172,.121-.25-.459-.689-.52-1.609-.078-2.375,.399-.694,1.146-1.126,1.949-1.126,.049,0,.098,.002,.147,.005,.368-.743,1.134-1.254,2.018-1.254s1.65,.512,2.018,1.254c.049-.003,.098-.005,.147-.005,.803,0,1.55,.432,1.95,1.127,.441,.764,.38,1.683-.079,2.373,.052,.078,.079,.167,.121,.25h.843c1.792,0,3.25-1.458,3.25-3.25s-1.458-3.25-3.25-3.25Z"
          fill="currentColor"
        />
        <path
          d="M11.29,15.351l-1.04-.601,1.04-.601c.359-.207,.481-.666,.274-1.024-.207-.36-.666-.481-1.024-.274l-1.04,.601v-1.201c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v1.201l-1.04-.601c-.359-.207-.817-.085-1.024,.274-.207,.359-.084,.817,.274,1.024l1.04,.601-1.04,.601c-.359,.207-.481,.666-.274,1.024,.139,.241,.391,.375,.65,.375,.127,0,.256-.032,.375-.101l1.04-.601v1.201c0,.414,.336,.75,.75,.75s.75-.336,.75-.75v-1.201l1.04,.601c.118,.068,.247,.101,.375,.101,.259,0,.511-.134,.65-.375,.207-.359,.084-.817-.274-1.024Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default sunCloudSnow;
