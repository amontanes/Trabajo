const express = require('express');
const passport = require('passport');
const xsenv = require('@sap/xsenv');
const JWTStrategy = require('@sap/xssec').JWTStrategy;
var pdf = require('dynamic-html-pdf');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require("https");
const FormData = require('form-data');

const app = express();

//const services = xsenv.getServices({ uaa: 'ParserPDFUAA' });

//passport.use(new JWTStrategy(services.uaa));

app.use(passport.initialize());
//app.use(passport.authenticate('JWT', { session: false }));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/', function(req, res) {
    var respuesta = {
     error: true,
     mensaje: 'Punto de inicio',
     url: 'HTTPS://+...+/EstadoCuenta'
    };
    res.send(respuesta);
   });

app.route('/EstadoCuenta')
.post(function (req, resParser) {   

    var context = mappingReqToContext(req);
    //var fs = require('fs');

    // Leer template HTML
    var html = fs.readFileSync('template.html', 'utf8');

    // Formatea la impresión
    var options = {
        format: "A3", // Cambio de formato
        orientation: "landscape",
        base:"file:///" + __dirname + "/",
        border: {
            top: "10mm",            // default is 0, units: mm, cm, in, px
            right: "1mm",
            bottom: "20mm",
            left: "1mm"
          }
    };

    // Genera el objeto documento
    var document = {
        type: 'buffer',     // Puede ser 'file' o 'buffer'
        template: html,
        context: context
        //,path: "./output.pdf"    // En caso que sea 'file'
};

var binario;

let respuesta = {
    error: true, 
    mensaje: '',
    url: ''
};

pdf.create(document, options)
    .then(res => {

        // PDF generado exitosamente
        binario = res;

        //var http = require("https");
        //var FormData = require('form-data');
        //var fs = require('fs')

        var form = new FormData();
        const { v4: uuidv4 } = require('uuid');

        var filename = uuidv4() + '.pdf';       
        //var hostname = 'baitcon-objectstore-sample-svc.cfapps.us10.hana.ondemand.com';
        var hostname = 'aysa-objectstore-svc.cfapps.eu10.hana.ondemand.com';
        var path     = '/objectstorage.svc/api/v1/storage/';
        form.append('my_field', binario, filename);

        var options = {
            hostname: hostname,
            path: path,
            method: 'POST',
            headers: form.getHeaders()
        }

        var req = http.request(options, function (resObjStore) {
        var chunks = [];

        respuesta =  {
            error: false, 
            mensaje: '',
            url: '',
        };      

        resObjStore.on("data", function (chunk) {
            chunks.push(chunk);
        });

        resObjStore.on("end", function () {
            // Fin de envío
            var body = Buffer.concat(chunks);
            console.log(body.toString());

            if(body.toString().includes('is successfully uploaded.'))
            {
                // Forma objeto respuesta
                respuesta = {
                    error: false, 
                    mensaje: 'PDF subido exitosamente',
                    url: `https://${hostname}${path}${filename}`
                };
            }
            else{
                // Forma objeto respuesta
                respuesta = {
                    error: true, 
                    mensaje: 'Error al subir PDF',
                    url: '',
                };
            }

            // Envía respuesta
            resParser.send(respuesta);            
            });
        });

        // Pipe form to request
        form.pipe(req);

    })
    .catch(error => {
        console.error(error)
        // Error al generar PDF
        respuesta = {
            error: true, 
            mensaje: 'Error al generar PDF',
            url: ''
        };
        // Envía respuesta
        resParser.send(respuesta);  
    });
})


app.use(function(req, res, next) {
    var respuesta = {
     error: true, 
     mensaje: 'URL no encontrada',
     url: ''
    };
    res.status(404).send(respuesta);
   });
   app.listen(3000, () => {
    console.log("El servidor está inicializado en el puerto 8080");
   });

    function mappingReqToContext(req){
            var partner = req.body.E_PARTNER;
            var account = req.body.T_ACCOUNT.item; // Un solo ítem

            var date = getDate();

            account.ZZSALDO_CTA     = formatAmount(account.ZZSALDO_CTA);
            account.ZZTOT_ORIGINAL  = formatAmount(account.ZZTOT_ORIGINAL);
            account.ZZTOT_INT_REC   = formatAmount(account.ZZTOT_INT_REC);
            account.ZZTOT_AC_JUD    = formatAmount(account.ZZTOT_AC_JUD);
            account.ZZTOT_IVA       = formatAmount(account.ZZTOT_IVA);
            account.ZZTOT_OTROS_IMP = formatAmount(account.ZZTOT_OTROS_IMP);
            account.ZZTOT_GRAL      = formatAmount(account.ZZTOT_GRAL);                                                        

            if (req.body.T_DET_XBLNR != '')
            {
                var t_det_xblnr = convertArray(req.body.T_DET_XBLNR.item);
            }
            var t_sub_total = convertArray(req.body.T_SUB_TOTAL.item);
            var leyenda_pie = convertArray(req.body.I_LEYENDA_PIE.item);

            if (req.body.T_DET_XBLNR != '')
            {
                var items_gastos   = getItems('GASTOS',         t_det_xblnr, t_sub_total);
                var items_cuotas   = getItems('CUOTAS',         t_det_xblnr, t_sub_total);
                var items_facturas = getItems('FACTURA / ND',   t_det_xblnr, t_sub_total);
                var items_creditos = getItems('CRÉDITOS',       t_det_xblnr, t_sub_total);
            }
            return  {
                date:           date,
                partner:        partner,
                account:        account,
                items_gastos:   items_gastos,
                items_cuotas:   items_cuotas,
                items_facturas: items_facturas,
                items_creditos: items_creditos,
                leyenda_pie:    leyenda_pie
            };
   }

   function getItems(tipo_doc, t_det_xblnr, t_sub_total){

        var items = [];
        var exist = false;

        t_det_xblnr.forEach(item => {
            if(item.ZZTIPO_DOC == tipo_doc){

                item.ZZTOT_ORIGINAL  = formatAmount(item.ZZTOT_ORIGINAL);
                item.ZZTOT_INT_REC   = formatAmount(item.ZZTOT_INT_REC);
                item.ZZTOT_AC_JUD    = formatAmount(item.ZZTOT_AC_JUD);
                item.ZZTOT_IVA       = formatAmount(item.ZZTOT_IVA);
                item.ZZTOT_OTROS_IMP = formatAmount(item.ZZTOT_OTROS_IMP);
                item.ZZTOT_GRAL      = formatAmount(item.ZZTOT_GRAL);

                items.push(item);

                exist = true;
            }
        });

        var sub_total = t_sub_total.find( sub_total => sub_total.ZZTIPO_DOC == tipo_doc);
        if (sub_total)
        {
            sub_total.ZZTOT_ORIGINAL    = formatAmount(sub_total.ZZTOT_ORIGINAL);
            sub_total.ZZTOT_INT_REC     = formatAmount(sub_total.ZZTOT_INT_REC);
            sub_total.ZZTOT_AC_JUD      = formatAmount(sub_total.ZZTOT_AC_JUD);
            sub_total.ZZTOT_IVA         = formatAmount(sub_total.ZZTOT_IVA);
            sub_total.ZZTOT_OTROS_IMP   = formatAmount(sub_total.ZZTOT_OTROS_IMP);
            sub_total.ZZTOT_GRAL        = formatAmount(sub_total.ZZTOT_GRAL);
        }
        var items_tipo_doc = { exist,
                               items,
                               sub_total
                             } ;

        return items_tipo_doc;

   }

   function formatAmount(importe){
       // Formatea el importe con '.' como separador de miles y ',' como separador de decimales
       // Lo hace a través de una RegEx
        var number = importe;
        const exp = /(\d)(?=(\d{3})+(?!\d))/g;
        const rep = '$1.';
        let arr = number.toString().split('.');
        arr[0] = arr[0].replace(exp,rep);
        return arr[1] ? arr.join(','): arr[0];
   }

   function getDate()
   {
    var hoy = new Date(); 
    var dd = hoy.getDate(); 
    var mm = hoy.getMonth() + 1; 
    var yyyy = hoy.getFullYear(); 

    var fecha = addZero(dd) + '/' + addZero(mm) + '/' + yyyy; 

    var hora = addZero(hoy.getHours()) + ':' + addZero(hoy.getMinutes()) + ':' + addZero(hoy.getSeconds());

    return  {
        fecha: fecha,
        hora: hora,
        }

   }

   function addZero(i){

    if (i < 10) { 
        i = '0' + i; 
    } 
    return i;
   }


   function convertArray(posibleArray)
   {
        var array = [];

        if(Array.isArray(posibleArray)){
            array = posibleArray;
        }
        else{
            array.push(posibleArray);
        }

        return array;
   }