# Micro service framework

# Custom response
On the requestContext you can send a custom response.

#### Example
```
this.requestContext.addHeader("Content-Type", 'application/vnd.ms-excel' );
this.requestContext.addHeader('Content-disposition', 'attachment; filename=file.xlsx' );
this.requestContext.responseCustom = fileExcel;
```