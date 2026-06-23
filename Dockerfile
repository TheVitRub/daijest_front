FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY digest-builder.html register.html style.css dom-to-image-more.min.js html2canvas.min.js jszip.min.js jspdf.umd.min.js /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY logos/ /usr/share/nginx/html/logos/

EXPOSE 80
